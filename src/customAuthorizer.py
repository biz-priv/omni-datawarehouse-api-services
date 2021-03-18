import os
import json
import logging
import jsonschema


logger = logging.getLogger()
logger.setLevel(logging.INFO)

from src.common import dynamo_query
from jsonschema import validate
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

    #Validating params only for the GET APIs
    if "/create/shipment" not in event["methodArn"]:
        validation_response = validate_input(params)
        if validation_response["status"] == "error":
            return generate_policy(None, 'Deny', event["methodArn"], None, validation_response["message"])

    #Get customer ID based on the api_key
    response = dynamo_query(os.environ["TOKEN_VALIDATION_TABLE"], os.environ["TOKEN_VALIDATION_TABLE_INDEX"],
            'ApiKey = :apikey', {":apikey": {"S": api_key}})

    customer_id = validate_dynamo_query_response(response, event, None, "Customer Id not found.")

    #Validate if the given fil_nbr or house_bill_nbr has an entry in the DB and get its customer_id
    if "/create/shipment" in event["methodArn"]:
        return generate_policy(PolicyId, 'Allow', event["methodArn"], customer_id)

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

        bol_response = dynamo_query(os.environ["CUSTOMER_ENTITLEMENT_TABLE"], index, query,
                        {":id": {"S": customer_id}, ":num": {"S": num}})
        return validate_dynamo_query_response(bol_response, event, customer_id)

def validate_dynamo_query_response(response, event, customer_id=None, message=None):
    try:
        if not response or "Items" not in response or len(response['Items']) == 0:
            return generate_policy(None, 'Deny', event["methodArn"], None, "No records found for given input")
        if not customer_id:
            return response['Items'][0]['CustomerID']['S']
        else:
            return generate_policy(PolicyId, 'Allow', event["methodArn"], customer_id)
    except Exception as e:
        logging.exception("CustomerIdNotFound: {}".format(e))
        raise CustomerIdNotFound(json.dumps({"httpStatus": 400, "message": "Customer Id not found."}))

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
    except jsonschema.exceptions.ValidationError as e:
        logging.exception("Validation error: {}".format(e))
        return {"status": "error", "message": e.message}
    return {"status": "success"}

class ApiKeyError(Exception): pass
class HandlerError(Exception): pass
class CustomerIdNotFound(Exception): pass
class GeneratePolicyError(Exception): pass
class InputError(Exception): pass
