import os
import logging
import boto3
import json
import requests
from datetime import datetime, timedelta

sns = boto3.client('sns')
sqs = boto3.client('sqs')
dynamodb = boto3.client('dynamodb')
lambda_client = boto3.client('lambda')

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

# AMAZON_POD_STREAM_DLQ = os.environ["AMAZON_POD_STREAM_DLQ"]
SNS_TOPIC_ARN = os.environ["SNS_TOPIC_ARN"]
LOG_TABLE = os.environ["LOG_TABLE"]
SHIPPEO_GET_DOC_API_KEY = os.environ["SHIPPEO_GET_DOC_API_KEY"]
WT_WEBSLI_API_URL = os.environ["WT_WEBSLI_API_URL"]
SHIPMENT_FILE_TABLE = os.environ["SHIPMENT_FILE_TABLE"]
TOKEN_VALIDATOR = os.environ["TOKEN_VALIDATOR"]
TOKEN_VALIDATION_TABLE_INDEX = os.environ["TOKEN_VALIDATION_TABLE_INDEX"]
UPLOAD_DOC_LAMBDA_FUNCTION = os.environ["UPLOAD_DOC_LAMBDA_FUNCTION"]
USER_NAME = os.environ["USER_NAME"]
PASSWORD = os.environ["PASSWORD"]


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

            b64_data = ""
            file_name = ""
            b64str_response = call_wt_rest_api(housebill_no,  'HCPOD')
            if b64str_response == 'error':
                LOGGER.info('Error calling WT REST API')
                # handle error case
            else:
                b64_data = b64str_response['b64str']
                file_name = b64str_response['file_name']

            shipment_file_data = get_data_from_shipment_file_table(order_no)
            if shipment_file_data == None:
                LOGGER.info(
                    f"House bill : {housebill_no} with order no: {order_no} is not valid")
                return {
                    'statusCode': 404
                }

            reference_no = get_data_from_reference_table(order_no)
            LOGGER.info("reference_no: %s", reference_no)

            pro_number = reference_no if reference_no != None else housebill_no
            filename = shipment_file_data['FileName']['S']
            file_type = 'POD'
            description = 'HCPOD'
            file_extension = filename.split('.')[-1].lower()
            mime_type = 'application/pdf' if file_extension == 'pdf' else 'image/jpeg'
            request_source = 'OMNG'
            user_id = body['Item']['UserId']
            location_id = 'US'

            payload = {
                "pro_number": pro_number,
                "filename": filename,
                "file_type": file_type,
                "description": description,
                "mime_type": mime_type,
                "request_source": request_source,
                "user_id": user_id,
                "location_id": location_id,
                "b64_data": b64_data,
                "user_name": USER_NAME,
                "password": PASSWORD
            }
            # LOGGER.info(f"payload: {payload}")
            if reference_no == None:
                LOGGER.info("No reference number.")
                return {
                    'statusCode': 404
                }
            invoke_java_lambda(payload)
            return {
                'statusCode': 200
            }

    except Exception as e:
        logging.error(f"Error: {e}")
        try:

            # sqs.send_message(
            #     QueueUrl=AMAZON_POD_STREAM_DLQ,
            #     MessageBody=json.dumps(body)
            # )
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


def call_wt_rest_api(housebill, doc_type):
    try:
        temp_url = "https://websli.omnilogistics.com/wtTest/getwtdoc/v1/json/9980f7b9eaffb71ce2f86734dae062"
        url = f"{temp_url}/housebill={housebill}/doctype={doc_type}"
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


def invoke_java_lambda(payload):
    lambda_client = boto3.client('lambda')
    response = lambda_client.invoke(
        FunctionName="java-lambda-for-amazon-pod-upload-doc-dev",
        # FunctionName=UPLOAD_DOC_LAMBDA_FUNCTION,
        InvocationType="RequestResponse",  # Use "Event" for asynchronous invocation
        Payload=json.dumps(payload),
    )

    # Parse and process the response
    response_payload = json.loads(response['Payload'].read().decode())
    LOGGER.info(f"Response from Lambda: {response_payload}")


class GetDocumentError(Exception):
    pass


class WebsliTokenNotFoundError(Exception):
    pass


class HouseBillNotValidError(Exception):
    pass
