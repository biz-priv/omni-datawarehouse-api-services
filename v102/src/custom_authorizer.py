import os
import json
import logging
import jsonschema
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

from src.common import dynamo_query
from jsonschema import validate

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
        LOGGER.info("Event: %s", json.dumps(event))
        api_key = event['headers']['x-api-key']
        params = event["queryStringParameters"]
    except Exception as api_key_error:
        logging.exception("ApiKeyError: %s", json.dumps(api_key_error))
        raise ApiKeyError(json.dumps({"httpStatus": 400, "message": "API Key not passed."})) from api_key_error

    #Validating params only for the GET APIs
    if "/create/shipment" not in event["methodArn"]:
        validation_response = validate_input(params)
        if validation_response["status"] == "error":
            return generate_policy(None, 'Deny', event["methodArn"], None, validation_response["message"])

    #Get customer ID based on the api_key
    response = dynamo_query(os.environ["TOKEN_VALIDATION_TABLE"], os.environ["TOKEN_VALIDATION_TABLE_INDEX"],
            'ApiKey = :apikey', {":apikey": {"S": api_key}})

    customer_id = validate_dynamo_query_response(response, event, None, "Invalid API Key")
    if type(customer_id) != str:
        return customer_id

    #Validate if the given fil_nbr or house_bill_nbr has an entry in the DB and get its customer_id
    if "/create/shipment" in event["methodArn"]:
        return generate_policy(POLICY_ID, 'Allow', event["methodArn"], customer_id)
    else:
        query = "CustomerID = :id AND "
        if "file_nbr" in params:
            num = params["file_nbr"]
            index = os.environ["CUSTOMER_ENTITLEMENT_FILENUMBER_INDEX"]
            query += "FileNumber = :num"

        elif "house_bill_nbr" in params:
            num = params["house_bill_nbr"]
            index = os.environ["CUSTOMER_ENTITLEMENT_HOUSEBILL_INDEX"]
            query += "HouseBillNumber = :num"

        try:
            bol_response = dynamo_query(os.environ["CUSTOMER_ENTITLEMENT_TABLE"], index, query,
                        {":id": {"S": customer_id}, ":num": {"S": num}})
            return validate_dynamo_query_response(bol_response, event, customer_id)
        except Exception as bol_error:
            logging.exception("Bol_responseError: %s", json.dumps(bol_error))

def validate_dynamo_query_response(response, event, customer_id=None, message=None):
    try:
        if not response or "Items" not in response or len(response['Items']) == 0:
            return generate_policy(None, 'Deny', event["methodArn"], None, message)
        if not customer_id:
            return response['Items'][0]['CustomerID']['S']
        else:
            return generate_policy(POLICY_ID, 'Allow', event["methodArn"], customer_id)
    except Exception as id_not_found_error:
        logging.exception("CustomerIdNotFound: %s", json.dumps(id_not_found_error))
        raise CustomerIdNotFound(json.dumps({"httpStatus": 400, "message": "Customer Id not found."})) from id_not_found_error

#Validate supplied input against the expected schema
def validate_input(payload):
    schema = {
        "type": "object",
        "properties": {
            "house_bill_nbr": {"type": "string"},
            "file_nbr": {"type": "string"}
        },
        "additionalProperties": False,
        "minProperties": 1,
        "maxProperties": 1
    }
    try:
        validate(instance=payload,schema=schema)
    except jsonschema.exceptions.ValidationError as validate_error:
        logging.exception("Validation error: %s", validate_error)
        return {"status": "error", "message": validate_error.message}
    return {"status": "success"}

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
