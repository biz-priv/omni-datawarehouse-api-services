import os
import json
import botocore.session
session = botocore.session.get_session()
client = session.create_client('dynamodb', region_name='us-east-1')

def dynamoQuery(api_key, event, context):
    try:
        response = client.query(
            TableName=os.environ["TOKEN_VALIDATION_TABLE"],
            IndexName='ApiKeyindex',
            KeyConditionExpression='ApiKey = :apikey',
            ExpressionAttributeValues={":apikey": {"S": api_key}}
        )
        print ("Dynamo query response: ", response)
        if (len(response['Items']) == 0):
            return None
        else:
            return response['Items'][0]['CustomerID']['S']
    except error as e:
        raise error({"Error": True,"message":str(e)})

def dynamoGetItem(customerId, house_bill_nbr):
    try:
        response = client.get_item(
            TableName=os.environ["CUSTOMER_ENTITLEMENT_TABLE"],
            Key={
                "CustomerID": {
                    "S": customerId
                },
                "HouseBillNumber":{
                    "S": house_bill_nbr
                }
            }
        )
        print ("Dynamo get response: ", response)
        if "Item" in response:
            return "exists"
        else:
            return None
        
    except error as e:
        raise error({"Error": True,"message":str(e)})

def generate_policy(principalId, effect, methodArn, customerId = None):
    try:
        print ("Inserting "+effect+" policy on API Gateway")
        policy = {}
        policy["principalId"] = principalId
        policyDocument = {
            'Version': '2012-10-17',
            'Statement': [
                {
                    'Sid': 'ApiAccess',
                    'Action': 'execute-api:Invoke',
                    'Effect': effect,
                    'Resource': methodArn
                }
            ]
        }
        policy["policyDocument"] = policyDocument
        if customerId:
            policy["context"] = {
                "customerId": customerId
            }
        return policy
    except error as e:
        raise error({"Error": True,"message":str(e)})

def dynamoGetFileNbr(customerId, file_nbr):
    try:
        response = client.get_item(
            TableName=os.environ["FILE_NUMBER_TABLE"],
            Key={
                "CustomerID": {
                    "S": customerId
                },
                "FileNumber":{
                    "S": file_nbr
                }
            }
        )
        print ("Dynamo get response: ", response)
        if "Item" in response:
            return "exists"
        else:
            return None
    except error as e:
        raise error({"Error": True,"message":str(e)})
class error(Exception):
    def __init___(self, message):
        Exception.__init__(self, "error : {}".format(message))
        self.message = message
        #Python inbuilt error class to change the error into stack format

def handler(event, context):
    try:        
        print(json.dumps(event))
        api_key = event['headers']['x-api-key']
        print("This is the api key : " + api_key)
        customerId = dynamoQuery(api_key, event, context)
        if not customerId:
            return generate_policy(None, 'Deny', event["methodArn"])
        if "/create/shipment" in event["methodArn"]:
            return generate_policy("bizCloud|a1b2", 'Allow', event["methodArn"], customerId)
        elif "/billoflading" in event["methodArn"]:
            file_nbr = event['queryStringParameters']['file_nbr']
            print("This is the File number provided by customer : " + file_nbr)
            if not dynamoGetFileNbr(customerId, file_nbr):
                return generate_policy(None, 'Deny', event["methodArn"])
            return generate_policy("bizCloud|a1b2", 'Allow', event["methodArn"], customerId)
        else:
            house_bill_nbr = event['queryStringParameters']['house_bill_nbr']
            print("This is the HouseBill number provided by customer : " + house_bill_nbr)
            if not dynamoGetItem(customerId, house_bill_nbr):
                return generate_policy(None, 'Deny', event["methodArn"])
            return generate_policy("bizCloud|a1b2", 'Allow', event["methodArn"], customerId)
    except error as e:
        raise error({"Error": True,"message":str(e)})