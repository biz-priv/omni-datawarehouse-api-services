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
        policy["context"] = {}
        if customer_id:
            policy["context"]["customerId"] = customer_id
        if message:
            policy["context"]["stringKey"] = message
        return policy
    except Exception as e:
        logging.exception("GeneratePolicyError: {}".format(e))
        raise GeneratePolicyError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def handler(event, context):
    try:        
        logger.info("Event: {}".format(json.dumps(event)))
        api_key = event['headers']['x-api-key']
    except Exception as e:
        logging.exception("ApiKeyError: {}".format(e))
        raise ApiKeyError(json.dumps({"httpStatus": 400, "message": "API Key not passed."}))
    
    try:
        response = dynamo_query(os.environ["TOKEN_VALIDATION_TABLE"], os.environ["TOKEN_VALIDATION_TABLE_INDEX"], 
                'ApiKey = :apikey', {":apikey": {"S": api_key}})
        if (len(response['Items']) == 0):
            return generate_policy(None, 'Deny', event["methodArn"])
        customer_id = response['Items'][0]['CustomerID']['S']
    except Exception as e:
        logging.exception("CustomerIdNotFound: {}".format(e))
        raise CustomerIdNotFound(json.dumps({"httpStatus": 400, "message": "Customer Id not found."}))
    
    try:
        if "/create/shipment" in event["methodArn"]:
            return generate_policy(PolicyId, 'Allow', event["methodArn"], customer_id)
        elif "/billoflading" in event["methodArn"]:
            file_nbr = event['queryStringParameters']['file_nbr']
            if not dynamo_get(os.environ["FILE_NUMBER_TABLE"], {"CustomerID": {"S": customer_id},"FileNumber":{"S": file_nbr}}):
                return generate_policy(None, 'Deny', event["methodArn"])
            return generate_policy(PolicyId, 'Allow', event["methodArn"], customer_id)
        else:
            if not 'house_bill_nbr' in event['queryStringParameters']:
                return generate_policy(None, 'Deny', event["methodArn"], None, "house_bill_nbr query parameter is required.")
            house_bill_nbr = event['queryStringParameters']['house_bill_nbr']
            hb_response = dynamo_query(os.environ["CUSTOMER_ENTITLEMENT_TABLE"], os.environ["CUSTOMER_ENTITLEMENT_HOUSEBILL_INDEX"], 
                'CustomerID = :id AND HouseBillNumber = :num', {":id": {"S": customer_id}, ":num": {"S": house_bill_nbr}})
            if not hb_response or "Items" not in hb_response or len(hb_response['Items']) == 0:
                return generate_policy(None, 'Deny', event["methodArn"])
            return generate_policy(PolicyId, 'Allow', event["methodArn"], customer_id)
    except Exception as e:
        logging.exception("HandlerError: {}".format(e))
        raise HandlerError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

class ApiKeyError(Exception): pass
class HandlerError(Exception): pass
class CustomerIdNotFound(Exception): pass
class GeneratePolicyError(Exception): pass
class InputError(Exception): pass