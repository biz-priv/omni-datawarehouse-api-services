import os
import base64
import logging
import boto3
import json
import requests
import io
from datetime import datetime, timedelta

sns = boto3.client('sns')
sqs = boto3.client('sqs')
dynamodb = boto3.client('dynamodb')

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

SHIPMENT_HEADER_TABLE = os.environ["SHIPMENT_HEADER_TABLE"]
SHIPMENT_HEADER_TABLE_STREAM_QLQ = os.environ["SHIPMENT_HEADER_TABLE_STREAM_QLQ"]
SNS_TOPIC_ARN = os.environ["SNS_TOPIC_ARN"]
SHIPPEO_USERNAME = os.environ["SHIPPEO_USERNAME"]
SHIPPEO_PASSWORD = os.environ["SHIPPEO_PASSWORD"]
SHIPPEO_GET_DOC_URL = os.environ["SHIPPEO_GET_DOC_URL"]
SHIPPEO_UPLOAD_DOC_URL = os.environ["SHIPPEO_UPLOAD_DOC_URL"]
LOG_TABLE = os.environ["LOG_TABLE"]
SHIPPEO_GET_TOKEN_URL = os.environ["SHIPPEO_GET_TOKEN_URL"]
SHIPPEO_GET_DOC_API_KEY = os.environ["SHIPPEO_GET_DOC_API_KEY"]
WT_WEBSLI_API_URL = os.environ["WT_WEBSLI_API_URL"]
SHIPMENT_FILE_TABLE = os.environ["SHIPMENT_FILE_TABLE"]
TOKEN_EXPIRATION_DAYS = os.environ["TOKEN_EXPIRATION_DAYS"]
TOKEN_VALIDATOR = os.environ["TOKEN_VALIDATOR"]
TOKEN_VALIDATION_TABLE_INDEX = os.environ["TOKEN_VALIDATION_TABLE_INDEX"]


def handler(event, context):
    LOGGER.info("Event: %s", event)
    records = event['Records']
    body = ""
    try:
        existing_token = get_existing_token()
        if existing_token == None:
            # Get token
            basic_auth = get_basic_auth(SHIPPEO_USERNAME, SHIPPEO_PASSWORD)
            LOGGER.info("basic_auth: %s", basic_auth)
            token_response = requests.post(
                SHIPPEO_GET_TOKEN_URL,
                headers={'Authorization': f'{basic_auth}'}
            )
            token = token_response.json()['data']['token']
            existing_token = token
            insert_token(token)

        websli_token = get_websli_token(SHIPPEO_GET_DOC_API_KEY)
        if websli_token == None:
            raise WebsliTokenNotFoundError("Websli token not found.")
        final_token = existing_token
        LOGGER.info("websli_token: %s", websli_token)
        for record in records:
            body = json.loads(record['body'])
            order_no = body['Item']['PK_OrderNo']
            housebill_no = body['Item']['Housebill']

            doc_type = get_if_house_bill_number_valid(order_no)
            LOGGER.info("doc_type: %s", doc_type)

            if doc_type == None:
                LOGGER.info(
                    f"House bill : {housebill_no} with order no: {order_no} is not valid")
                return {
                    'statusCode': 200
                }

            upload_to_url = f"{SHIPPEO_UPLOAD_DOC_URL}/{housebill_no}/files"
            # Upload docs
            result = upload_docs(upload_to_url, final_token,
                                 housebill_no, websli_token, doc_type)
            if result['status'] == 200:
                insert_log(housebill_no, result['data'])
            return {
                'statusCode': 200
            }

    except Exception as e:
        logging.error(f"Error: {e}")
        try:
            sns.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject="Error on shippeo-pod-upload-doc lambda",
                Message=f"Error in shippeo-pod-upload-doc lambda: {e}"
            )

            sqs.send_message(
                QueueUrl=SHIPMENT_HEADER_TABLE_STREAM_QLQ,
                MessageBody=json.dumps(body)
            )
        except Exception as e:
            logging.error(f"Error sending error notifications: {e}")
        return {
            'statusCode': 500
        }


def get_existing_token():
    try:
        # Define the query parameters
        params = {
            'TableName': LOG_TABLE,
            'KeyConditionExpression': "pKey = :pKey",
            'ExpressionAttributeValues': {
                ":pKey": {'S': 'token'}
            },
        }
        # Query the DynamoDB table
        response = dynamodb.query(**params)
        # Check if there are items in the result
        if len(response['Items']) > 0:
            return response['Items'][0]['data']['S']
        else:
            return None

    except Exception as e:
        LOGGER.info(f"Unable to insert item. Error: {e}")


def insert_token(data):
    two_days_from_now = datetime.utcnow() + timedelta(days=float(TOKEN_EXPIRATION_DAYS))
    two_days_from_now_iso = two_days_from_now.isoformat()
    params = {
        'TableName': LOG_TABLE,
        'Item': {
            'pKey': {'S': 'token'},
            'data': {'S': data},
            'expiration': {'S': two_days_from_now_iso}
        }
    }

    try:
        dynamodb.put_item(**params)
        LOGGER.info("Item inserted successfully")
    except Exception as e:
        LOGGER.info(f"Unable to insert item. Error: {e}")


def get_websli_token(apiKey):
    try:
        # Define the query parameters
        params = {
            'TableName': TOKEN_VALIDATOR,
            'IndexName': TOKEN_VALIDATION_TABLE_INDEX,
            'KeyConditionExpression': "ApiKey = :ApiKey",
            'ExpressionAttributeValues': {
                ":ApiKey": {'S': apiKey}
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


def get_basic_auth(username, password):
    credentials = f"{username}:{password}"
    base64_credentials = base64.b64encode(
        credentials.encode('utf-8')).decode('utf-8')
    return f"Basic {base64_credentials}"


def upload_docs(upload_to_url, token, house_bill_no, websli_token, doc_type):
    try:
        b64_data = ""
        file_name = ""
        b64str_response = call_wt_rest_api(
            house_bill_no, websli_token, doc_type)
        if b64str_response == 'error':
            LOGGER.info('Error calling WT REST API')
            # handle error case
        else:
            b64_data = b64str_response['b64str']
            file_name = b64str_response['file_name']

        file_data = io.BytesIO(base64.b64decode(b64_data))

        # Create a dictionary for the form data
        files = {'attachments[]': (
            file_name, file_data, 'application/octet-stream')}

        headers = {
            'Authorization': f'Bearer {token}',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br'
        }

        response = requests.post(upload_to_url, headers=headers, files=files)

        # Print response data and status code
        LOGGER.info(f"Response Data: {response.text}")
        LOGGER.info(f"Status Code: {response.status_code}")

        return {'data': response.text, 'status': response.status_code}
    except Exception as e:
        logging.error(f"Upload document error: {e}")
        return {'status': 400}


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
        params = {
            'TableName': SHIPMENT_FILE_TABLE,
            'KeyConditionExpression': "FK_OrderNo = :FK_OrderNo",
            'FilterExpression': "(FK_DocType = :FK_DocType1 OR FK_DocType = :FK_DocType2) AND CustomerAccess = :CustomerAccess",
            'ExpressionAttributeValues': {
                ":FK_OrderNo": {'S': order_no},
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


class GetDocumentError(Exception):
    pass


class WebsliTokenNotFoundError(Exception):
    pass


class HouseBillNotValidError(Exception):
    pass
