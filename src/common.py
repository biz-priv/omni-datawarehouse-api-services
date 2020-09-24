import os
import json
import logging
import botocore.session
session = botocore.session.get_session()

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def dynamo_query(table_name, index_name, expression, attributes):
    try:
        client = session.create_client('dynamodb', region_name=os.environ['REGION'])
        response = client.query(
            TableName=table_name,
            IndexName=index_name,
            KeyConditionExpression=expression,
            ExpressionAttributeValues=attributes
        )
        logger.info("Dynamo query response: {}".format(json.dumps(response)))
        return response
    except Exception as e:
        logging.exception("DynamoQueryError: {}".format(e))
        raise DynamoQueryError(json.dumps({"httpStatus": 501, "message": "Internal Error."}))

def dynamo_get(table_name, key):
    try:
        client = session.create_client('dynamodb', region_name=os.environ['REGION'])
        response = client.get_item(
            TableName=table_name,
            Key=key
        )
        logger.info("Dynamo get response: {}".format(json.dumps(response)))
        if "Item" in response:
            return response["Item"]
        else:
            return None
    except Exception as e:
        logging.exception("DynamoGetError: {}".format(e))
        raise DynamoGetError(json.dumps({"httpStatus": 501, "message": "Internal Error."}))

class DynamoQueryError(Exception): pass
class DynamoGetError(Exception): pass