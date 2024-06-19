# """
# * File: v103\src\custom_authorizer.py
# * Project: Omni-datawarehouse-api-services
# * Author: Bizcloud Experts
# * Date: 2023-12-28
# * Confidential and Proprietary
# """
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
        LOGGER.info("Inserting : policy on API Gateway %s", effect)
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
        LOGGER.info("Policy: %s",policy)
        return policy
    except Exception as generate_policy_error:
        logging.exception("GeneratePolicyError: %s",generate_policy_error)
        raise GeneratePolicyError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from generate_policy_error

def handler(event, context):
    try:
        LOGGER.info("Event: %s",event)
        api_key = event['headers']['x-api-key']
        params = event["queryStringParameters"]
    except Exception as api_key_error:
        logging.exception("ApiKeyError: %s",api_key_error)
        raise ApiKeyError(json.dumps({"httpStatus": 400, "message": "API Key not passed."})) from api_key_error

    #Validating params only for the GET APIs
    if "/create/shipment" not in event["methodArn"]:
        validation_response = validate_input(params)
        if validation_response["status"] == "error":
            return generate_policy(None, 'Deny', event["methodArn"], None, validation_response["message"])

    #Get customer ID based on the api_key
    response = dynamo_query(os.environ["TOKEN_VALIDATION_TABLE"], os.environ["TOKEN_VALIDATION_TABLE_INDEX"],
            'ApiKey = :apikey', {":apikey": {"S": api_key}})
    LOGGER.info("token validation table response : %s",json.dumps(response))

    #Validate if the given fil_nbr or house_bill_nbr has an entry in the DB and get its customer_id
    customer_id = validate_dynamo_query_response(response, event, None, "Invalid API Key")
    if type(customer_id) != str:
        return customer_id

    if customer_id in ["mechanical-orchard"]:
        return generate_policy(POLICY_ID, 'Allow', event["methodArn"], customer_id)
    elif "/create/shipment" in event["methodArn"]:
        return generate_policy(POLICY_ID, 'Allow', event["methodArn"], customer_id)

    else:
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
            LOGGER.info("Customer Entitlement response for all GET API's : %s",bol_response)
            return validate_dynamo_query_response(bol_response, event, customer_id,msg)
        except Exception as bol_response_error:
            logging.exception("Bol_responseError: %s",bol_response_error)

def validate_dynamo_query_response(response, event, customer_id=None, message=None):
    try:
        if not response or "Items" not in response or len(response['Items']) == 0:
            return generate_policy(None, 'Deny', event["methodArn"], None, message)
        if not customer_id:
            return response['Items'][0]['CustomerID']['S']
        else:
            return generate_policy(POLICY_ID, 'Allow', event["methodArn"], customer_id)
    except Exception as customer_id_not_found_error:
        logging.exception("CustomerIdNotFound: %s",customer_id_not_found_error)
        raise CustomerIdNotFound(json.dumps({"httpStatus": 400, "message": "Customer Id not found."})) from customer_id_not_found_error

#Validate supplied input against the expected schema
def validate_input(payload):
    schema = {
        "type": "object",
        "properties": {
            "house_bill_nbr": {"type": "string"},
            "file_nbr": {"type": "string"},
            "milestone_history" : {"type": "string",
                                "enum" : ["True","t","true","T","1","False","f","false","F","0"]}
        },
        "additionalProperties": False,
        "minProperties": 1,
        "maxProperties": 2
    }
    try:
        validate(instance=payload,schema=schema)
    except jsonschema.exceptions.ValidationError as validation_error:
        logging.exception("Validation error: %s",validation_error)
        return {"status": "error", "message": validation_error.message}
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
