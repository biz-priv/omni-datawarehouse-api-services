import os
import json
import logging

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

from src.common import dynamo_query
from src.common import dynamo_get

POLICY_ID="bizCloud|a1b2"
INTERNAL_ERROR_MESSAGE="Internal Error."

def generate_policy(principal_id, effect, method_arn, customer_id = None, message = None):
    try:
        LOGGER.info("Inserting policy on API Gateway : %s", json.dumps(effect))
        policy = {}
        policy["principalId"] = principal_id
        policy_document = {
            'Version': '2012-10-17',
            'Statement': [
                {
                    'Sid': 'ApiAccess',
                    'Action': 'execute-api:Invoke',
                    'Effect': effect,
                    'Resource': method_arn
                }
            ]
        }
        policy["policyDocument"] = policy_document
        if message:
            policy["context"] = {"message": message}
        else:
            if customer_id:
                policy["context"] = {"customerId": customer_id}
        LOGGER.info("Policy: %s", json.dumps(policy))
        return policy
    except Exception as policy_error:
        logging.exception("GeneratePolicyError: %s", json.dumps(policy_error))
        raise GeneratePolicyError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from policy_error

def handler(event, context):
    try:
        LOGGER.info("Event:  %s", json.dumps(event))
        api_key = event['headers']['x-api-key']
        params = event["queryStringParameters"]
    except Exception as api_key_error:
        logging.exception("ApiKeyError: %s", json.dumps(api_key_error))
        raise ApiKeyError(json.dumps({"httpStatus": 400, "message": "API Key not passed."})) from api_key_error

    validation_response = validate_input(event["methodArn"], params)
    if validation_response["status"] == "error":
        return generate_policy(None, 'Deny', event["methodArn"], None, validation_response["message"])

    response = dynamo_query(os.environ["TOKEN_VALIDATION_TABLE"], os.environ["TOKEN_VALIDATION_TABLE_INDEX"],
            'ApiKey = :apikey', {":apikey": {"S": api_key}})

    customer_id = validate_dynamo_query_response(response, event, None, "Invalid API Key")
    if type(customer_id) != str:
        return customer_id

    if "/create/shipment" in event["methodArn"]:
        return generate_policy(POLICY_ID, 'Allow', event["methodArn"], customer_id)
    elif "/billoflading" in event["methodArn"]:
        query = "CustomerID = :id AND "
        if "file_nbr" in params:
            num = params["file_nbr"]
            index = os.environ["CUSTOMER_ENTITLEMENT_FILENUMBER_INDEX"]
            query += "FileNumber = :num"
            msg = "File number does not exist."
        elif "house_bill_nbr" in params:
            num = params["house_bill_nbr"]
            index = os.environ["CUSTOMER_ENTITLEMENT_HOUSEBILL_INDEX"]
            query += "HouseBillNumber = :num"
            msg = "House bill number does not exist."
        try:
            bol_response = dynamo_query(os.environ["CUSTOMER_ENTITLEMENT_TABLE"], index, query,
                        {":id": {"S": customer_id}, ":num": {"S": num}})
            return validate_dynamo_query_response(bol_response, event, customer_id)
        except Exception as bol_error:
            logging.exception("Bol_responseError: %s", json.dumps(bol_error))
    else:
        house_bill_nbr = event['queryStringParameters']['house_bill_nbr']
        hb_response = dynamo_query(os.environ["CUSTOMER_ENTITLEMENT_TABLE"], os.environ["CUSTOMER_ENTITLEMENT_HOUSEBILL_INDEX"],
            'CustomerID = :id AND HouseBillNumber = :num', {":id": {"S": customer_id}, ":num": {"S": house_bill_nbr}})
        return validate_dynamo_query_response(hb_response, event, customer_id, "House bill number does not exist.")

def validate_dynamo_query_response(response, event, customer_id=None, message=None):
    try:
        if not response or "Items" not in response or len(response["Items"]) == 0:
            return generate_policy(POLICY_ID, 'Deny', event["methodArn"], None, message)
        if not customer_id:
            return response["Items"][0]['CustomerID']['S']
        return generate_policy(POLICY_ID, 'Allow', event["methodArn"], customer_id)
    except Exception as id_not_found_error:
        logging.exception("CustomerIdNotFound: %s", json.dumps(id_not_found_error))
        raise CustomerIdNotFound(json.dumps({"httpStatus": 400, "message": "Customer Id not found."})) from id_not_found_error


def validate_input(method_arn, params):
    if "/shipment/info" in method_arn or "/shipment/detail" in method_arn or "/invoice/detail" in method_arn:
        return validate_house_bill_nbr(params)
    elif "/billoflading" in method_arn:
        if "house_bill_nbr" in params and "file_nbr" in params:
            return get_response("error", "Either House bill number(house_bill_nbr) or File number(file_nbr) query parameter is required. Not both.")
        elif "house_bill_nbr" in params and "file_nbr" not in params:
            return get_response("success", "")
        elif "house_bill_nbr" not in params and "file_nbr" in params:
            return get_response("success", "")
        else:
            return get_response("error", "Either House bill number(house_bill_nbr) or File number(file_nbr) query parameter is required.")
    else:
        return {"status": "success"}

def validate_house_bill_nbr(params):
    if "house_bill_nbr" not in params:
        return {"status": "error", "message": "House bill number(house_bill_nbr) query parameter is required."}
    return {"status": "success"}

def get_response(status, msg):
    return {"status": status, "message": msg}

class ApiKeyError(Exception):
    pass
class HandlerError(Exception):
    pass
class CustomerIdNotFound(Exception):
    pass
class GeneratePolicyError(Exception):
    pass
class InputError(Exception):
    pass
