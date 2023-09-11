import os
import logging
import boto3
import json
import requests
from datetime import datetime, timedelta

sns = boto3.client('sns')
sqs = boto3.client('sqs')
dynamodb = boto3.client('dynamodb')

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

SHIPMENT_HEADER_TABLE_STREAM_QLQ = os.environ["SHIPMENT_HEADER_TABLE_STREAM_QLQ"]
SNS_TOPIC_ARN = os.environ["SNS_TOPIC_ARN"]
LOG_TABLE = os.environ["LOG_TABLE"]
SHIPPEO_GET_DOC_API_KEY = os.environ["SHIPPEO_GET_DOC_API_KEY"]
WT_WEBSLI_API_URL = os.environ["WT_WEBSLI_API_URL"]
SHIPMENT_FILE_TABLE = os.environ["SHIPMENT_FILE_TABLE"]
TOKEN_VALIDATOR = os.environ["TOKEN_VALIDATOR"]
TOKEN_VALIDATION_TABLE_INDEX = os.environ["TOKEN_VALIDATION_TABLE_INDEX"]


def handler(event, context):
    LOGGER.info("context: %s", context)
    LOGGER.info("Event: %s", event)
    records = event['Records']
    body = ""
    try:

        for record in records:
            body = json.loads(record['body'])
            order_no = body['Item']['PK_OrderNo']
            housebill_no = body['Item']['Housebill']

            shipment_file_data = get_data_from_shipment_file_table(order_no)
            if shipment_file_data == None:
                LOGGER.info(
                    f"House bill : {housebill_no} with order no: {order_no} is not valid")
                return {
                    'statusCode': 200
                }

            reference_no = get_data_from_reference_table(order_no)
            LOGGER.info("doc_type: %s", reference_no)

            tracking_no = reference_no if reference_no != None else housebill_no
            if reference_no != None and reference_no == housebill_no:
                return_id = ''
            if reference_no == None or reference_no == housebill_no:
                return_id = housebill_no
            shipment_request_id = ''
            filename = shipment_file_data['FileName']['S']
            file_type = 'POD'
            description = ''
            file_extension = filename.split('.')[-1].lower()
            mime_type = 'application/pdf' if file_extension == 'pdf' else 'image/jpeg'
            carrier_name = 'OMNG'
            carrier_reference_number = order_no
            tenant_id = 'ARPOD'
            user_id = body['Item']['UserId']
            destination_port = body['Item']['DestinationPort']

            if reference_no == None:
                LOGGER.info(
                    f"No reference number.")
                return {
                    'statusCode': 200
                }

            return {
                'statusCode': 200
            }

    except Exception as e:
        logging.error(f"Error: {e}")
        try:

            sqs.send_message(
                QueueUrl=SHIPMENT_HEADER_TABLE_STREAM_QLQ,
                MessageBody=json.dumps(body)
            )
            return {
                'statusCode': 500
            }
            sns.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject="Error on shippeo-pod-upload-doc lambda",
                Message=f"Error in shippeo-pod-upload-doc lambda: {e}"
            )
        except Exception as e:
            logging.error(f"Error sending error notifications: {e}")


def get_websli_token(api_key):
    try:
        # Define the query parameters
        params = {
            'TableName': TOKEN_VALIDATOR,
            'IndexName': TOKEN_VALIDATION_TABLE_INDEX,
            'KeyConditionExpression': "ApiKey = :ApiKey",
            'ExpressionAttributeValues': {
                ":ApiKey": {'S': api_key}
            },
        }
        # Query the DynamoDB table
        response = dynamodb.query(**params)
        # Check if there are items in the result
        if len(response['Items']) > 0:
            return response['Items'][0]['websli_key']['S']
        else:
            return None

    except Exception as e:
        LOGGER.info(f"Unable to insert item. Error: {e}")


def call_wt_rest_api(housebill, websli_token, doc_type):
    try:
        url = f"{WT_WEBSLI_API_URL}/{websli_token}/housebill={housebill}/doctype={doc_type}"
        LOGGER.info(f"url: {url}")
        response = requests.get(url)

        if response.status_code == 200:
            data = response.json()
            b64str = data['wtDocs']['wtDoc'][0]['b64str']
            file_name = data['wtDocs']['wtDoc'][0]['filename']
            return {
                'b64str': b64str,
                'file_name': file_name
            }
        else:
            LOGGER.info(
                f"Error calling WT REST API for housebill {housebill}. Status Code: {response.status_code}")
            raise GetDocumentError(
                f"Error calling WT REST API for housebill {housebill}. Status Code: {response.status_code}")

    except Exception as error:
        LOGGER.info(
            f"Error calling WT REST API for housebill {housebill}:{error}")
        return 'error'


def insert_log(housebill_number, data):
    now = datetime.utcnow().isoformat()
    params = {
        'TableName': LOG_TABLE,
        'Item': {
            'pKey': {'S': housebill_number},
            'data': {'S': json.dumps(data)},
            'lastUpdateTime': {'S': now},
        }
    }

    try:
        dynamodb.put_item(**params)
        LOGGER.info("Item inserted successfully")
    except Exception as e:
        LOGGER.info(f"Unable to insert item. Error: {e}")


def get_if_house_bill_number_valid(order_no):
    try:
        # Define the query parameters
        p_key = 'FK_OrderNo'
        params = {
            'TableName': SHIPMENT_FILE_TABLE,
            'KeyConditionExpression': f"FK_OrderNo = :{p_key}",
            'FilterExpression': "(FK_DocType = :FK_DocType1 OR FK_DocType = :FK_DocType2) AND CustomerAccess = :CustomerAccess",
            'ExpressionAttributeValues': {
                f":{p_key}": {'S': order_no},
                ":FK_DocType1": {'S': "HCPOD"},
                ":FK_DocType2": {'S': "POD"},
                ":CustomerAccess": {'S': "Y"},
            },
        }

        # Query the DynamoDB table
        response = dynamodb.query(**params)
        LOGGER.info(f"response: {response}")
        # Check if there are items in the result
        items = response['Items']
        if len(items) > 0:
            return items[0]['FK_DocType']['S']
        else:
            return None
    except Exception as e:
        LOGGER.info(f"Unable to insert item. Error: {e}")


def get_data_from_reference_table(order_no):
    try:
        # Define the query parameters
        params = {
            'TableName': 'omni-wt-rt-references-dev',
            'IndexName': 'omni-wt-rt-ref-orderNo-index-dev',
            'KeyConditionExpression': "FK_OrderNo = :FK_OrderNo",
            'FilterExpression': "(FK_RefTypeId = :FK_RefTypeId)",
            'ExpressionAttributeValues': {
                ":FK_OrderNo": {'S': order_no},
                ":FK_RefTypeId": {'S': "OD#"}
            },
        }

        # Query the DynamoDB table
        response = dynamodb.query(**params)
        LOGGER.info(f"response: {response}")
        # Check if there are items in the result
        items = response['Items']
        if len(items) > 0:
            return items[0]['ReferenceNo']['S']
        else:
            return None
    except Exception as e:
        LOGGER.info(f"Unable to insert item. Error: {e}")


def get_data_from_shipment_file_table(order_no):
    try:
        # Define the query parameters
        params = {
            'TableName': 'omni-wt-rt-shipment-file-dev',
            'KeyConditionExpression': "FK_OrderNo = :FK_OrderNo",
            "FilterExpression": "CustomerAccess = :CustomerAccess AND FK_DocType = :FK_DocType",
            'ExpressionAttributeValues': {
                ":FK_OrderNo": {'S': order_no},
                ":CustomerAccess": {'S': 'Y'},
                ":FK_DocType": {'S': 'HCPOD'}
            },
        }

        # Query the DynamoDB table
        response = dynamodb.query(**params)
        LOGGER.info(f"response: {response}")
        # Check if there are items in the result
        items = response['Items']
        if len(items) > 0:
            return items[0]
        else:
            return None
    except Exception as e:
        LOGGER.info(f"Unable to insert item. Error: {e}")


class GetDocumentError(Exception):
    pass


class WebsliTokenNotFoundError(Exception):
    pass


class HouseBillNotValidError(Exception):
    pass
