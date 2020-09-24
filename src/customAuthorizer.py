import os
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

from src.common import dynamo_query
from src.common import dynamo_get

PolicyId="bizCloud|a1b2"
InternalErrorMessage="Internal Error."

def generate_policy(principal_id, effect, method_arn, customer_id = None, message = None):
    try:
        print ("Inserting "+effect+" policy on API Gateway")
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
        logger.info("Policy: {}".format(json.dumps(policy)))
        return policy
    except Exception as e:
        logging.exception("GeneratePolicyError: {}".format(e))
        raise GeneratePolicyError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def handler(event, context):
    try:        
        logger.info("Event: {}".format(json.dumps(event)))
        api_key = event['headers']['x-api-key']
        params = event["queryStringParameters"]
    except Exception as e:
        logging.exception("ApiKeyError: {}".format(e))
        raise ApiKeyError(json.dumps({"httpStatus": 400, "message": "API Key not passed."}))

    validation_response = validate_input(event["methodArn"], params)
    if validation_response["status"] == "error":
        return generate_policy(None, 'Deny', event["methodArn"], None, validation_response["message"])

    try:
        response = dynamo_query(os.environ["TOKEN_VALIDATION_TABLE"], os.environ["TOKEN_VALIDATION_TABLE_INDEX"], 
                'ApiKey = :apikey', {":apikey": {"S": api_key}})
        customer_id = validate_dynamo_query_response(response, event)
    except Exception as e:
        logging.exception("CustomerIdNotFound: {}".format(e))
        raise CustomerIdNotFound(json.dumps({"httpStatus": 400, "message": "Customer Id not found."}))
    
    try:
        if "/create/shipment" in event["methodArn"]:
            return generate_policy(PolicyId, 'Allow', event["methodArn"], customer_id)
        elif "/billoflading" in event["methodArn"]:
            query = "CustomerID = :id AND "
            if "file_nbr" in params:
                num = params["file_nbr"]
                index = os.environ["CUSTOMER_ENTITLEMENT_FILENUMBER_INDEX"]
                query += "FileNumber = :num"
            elif "house_bill_nbr" in params:
                num = params["house_bill_nbr"]
                index = os.environ["CUSTOMER_ENTITLEMENT_HOUSEBILL_INDEX"]
                query += "HouseBillNumber = :num"
            bol_response = dynamo_query(os.environ["CUSTOMER_ENTITLEMENT_TABLE"], index, query, 
                            {":id": {"S": customer_id}, ":num": {"S": num}})
            return validate_dynamo_query_response(bol_response, event, customer_id)
        else:
            house_bill_nbr = event['queryStringParameters']['house_bill_nbr']
            hb_response = dynamo_query(os.environ["CUSTOMER_ENTITLEMENT_TABLE"], os.environ["CUSTOMER_ENTITLEMENT_HOUSEBILL_INDEX"], 
                'CustomerID = :id AND HouseBillNumber = :num', {":id": {"S": customer_id}, ":num": {"S": house_bill_nbr}})
            return validate_dynamo_query_response(hb_response, event, customer_id)
    except Exception as e:
        logging.exception("HandlerError: {}".format(e))
        raise HandlerError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def validate_dynamo_query_response(response, event, customer_id=None):
    if not response or "Items" not in response or len(response['Items']) == 0:
        return generate_policy(None, 'Deny', event["methodArn"])
    if not customer_id:
        return response['Items'][0]['CustomerID']['S']
    else:
        return generate_policy(PolicyId, 'Allow', event["methodArn"], customer_id)

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

class ApiKeyError(Exception): pass
class HandlerError(Exception): pass
class CustomerIdNotFound(Exception): pass
class GeneratePolicyError(Exception): pass
class InputError(Exception): pass