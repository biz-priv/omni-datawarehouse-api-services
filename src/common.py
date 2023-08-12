import os
import json
import logging
import botocore.session
import dicttoxml
import datetime
import boto3
from botocore.config import Config

session = botocore.session.get_session()
dynamodb_config = Config(
    retries=dict(
        max_attempts=2  # Maximum number of retries
    ),
    read_timeout=5,  # Timeout in secondss
    connect_timeout=5  # Timeout for establishing connections in seconds
)

dynamodb = boto3.client('dynamodb', region_name='us-east-1', config=dynamodb_config)

sns = boto3.client('sns', region_name='us-east-1')

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

INTERNAL_ERROR_MESSAGE = "Internal Error."
InternalErrorMessage = "Internal Error."


def dynamo_query(table_name, index_name, expression, attributes):
    try:
    #     client = session.create_client(
    #   'dynamodb', region_name=os.environ['REGION'],
    #     config=botocore.client.Config(
    #     retries={'max_attempts': 3},
    #     connect_timeout=5,
    #     read_timeout=5
    #     ))

        response = dynamodb.query(
            TableName=table_name,
            IndexName=index_name,
            KeyConditionExpression=expression,
            ExpressionAttributeValues=attributes
        )
        LOGGER.info("Dynamo query response: {}".format(json.dumps(response)))
        return response
    except Exception as dynamo_query_error:
        logging.exception("DynamoQueryError: %s", dynamo_query_error)
        raise DynamoQueryError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from dynamo_query_error


def dynamo_get(table_name, key):
    try:
        # client = session.create_client(
        #     'dynamodb', region_name=os.environ['REGION'])
        response = dynamodb.get_item(
            TableName=table_name,
            Key=key
        )
        LOGGER.info("Dynamo get response: %s", json.dumps(response))
        if "Item" in response:
            return response["Item"]
        else:
            return None
    except Exception as dynamo_get_error:
        logging.exception("DynamoGetError: %s", dynamo_get_error)
        raise DynamoGetError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from dynamo_get_error


def process_input(query):
    try:
        if "house_bill_nbr" in query:
            number = query['house_bill_nbr']
            parameter = " house_bill_nbr = "
            response = dynamo_query(os.environ['SHIPMENT_DETAILS_TABLE'], os.environ['SHIPMENT_DETAILS_HOUSEBILL_INDEX'],
                                    'HouseBillNumber = :house_bill_nbr', {":house_bill_nbr": {"S": number}})
        else:
            number = query['file_nbr']
            parameter = " file_nbr = "
            response = dynamo_query(os.environ['SHIPMENT_DETAILS_TABLE'], os.environ['SHIPMENT_DETAILS_FILENUMBER_INDEX'],
                                    'FileNumber = :file_nbr', {":file_nbr": {"S": number}})
        execution_parameters = [number, parameter, response]
        LOGGER.info("Process Input response: {}".format(
            json.dumps(execution_parameters)))
        return execution_parameters
    except Exception as input_error:
        logging.exception("ProcessingInputError: %s", input_error)
        raise ProcessingInputError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from input_error


def modify_response(data):
    try:
        response = {}
        response["Service Level Code"] = data[0]["ServiceLevel"]["S"]
        response["Service Level Description"] = data[0]["Service Level Description"]["S"]
        response["House Waybill"] = data[0]["HouseBillNumber"]["S"]
        response["File Number"] = data[0]["FileNumber"]["S"]
        response["Shipper Name"] = data[0]["ShipperName"]["S"]
        response["Consignee Name"] = data[0]["ConsigneeName"]["S"]
        response["Current Status"] = data[0]["ShipmentStatus"]["S"]
        response["Current Status Desc"] = data[0]["ShipmentStatusDescription"]["S"]
        response["File Date"] = data[0]["File Date"]["S"]
        return [response]
    except Exception as modify_error:
        logging.exception("ModifyResponseError: %s", modify_error)
        raise ModifyResponseError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from modify_error


def modify_date(x):
    try:
        y = datetime.datetime(1900, 1, 1, 0, 0)
        if x == None or x == y:
            return None
        else:
            return x.isoformat()
    except Exception as date_conversion_error:
        logging.exception("DateConversionError: %s", date_conversion_error)
        raise DateConversionError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from date_conversion_error


def modify_float(x):
    try:
        if x == None:
            return None
        else:
            return float(x)
    except Exception as float_conversion_error:
        logging.exception("FloatConversionError: %s", float_conversion_error)
        raise FloatConversionError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from float_conversion_error


def get_reference_list(data_obj):
    try:
        if "Reference List" in data_obj:
            temp_reference_list = modify_object_keys(
                data_obj["Reference List"])
            for bill_to_item in temp_reference_list:
                bill_to_item.update({"CustomerTypeV3": "BillTo"})
                bill_to_item.update({"RefTypeId": "REF"})

            def add_shipper(x):
                t = []
                for bill_to_item in x:
                    t.append(
                        {"ReferenceNo": bill_to_item['ReferenceNo'], "CustomerTypeV3": "Shipper", "RefTypeId": "REF"})
                x.extend(t)
                return x
            temp_reference_list = add_shipper(temp_reference_list)

            def reference_list_item(x): return 'NewShipmentRefsV3'
            reference_list = dicttoxml.dicttoxml(temp_reference_list,
                                                 attr_type=False, custom_root='ReferenceList', item_func=reference_list_item)
            reference_list = str(reference_list).\
                replace("""b'<?xml version="1.0" encoding="UTF-8" ?>""", """""").\
                replace("""</ReferenceList>'""", """</ReferenceList>""")
        else:
            reference_list = ''
        return reference_list
    except Exception as reference_list_error:
        logging.exception("GetReferenceListError: %s", reference_list_error)
        raise GetReferenceListError(json.dumps(
            {"httpStatus": 501, "message": InternalErrorMessage})) from reference_list_error


def modify_object_keys(array):
    new_array = []
    for obj in array:
        new_obj = {}
        for key in obj:
            new_key = key.replace(" ", "")
            new_obj[new_key] = obj[key]
        new_array.append(new_obj)
    return new_array


def send_notification_to_sns(error):
    # Send a notification to the SNS topic
    message = f"An error occurred in function {os.environ['FUNCTION_NAME']}. Error details: {error}."
    sns.publish(Message=message, TopicArn=os.environ['ERROR_SNS_ARN'])


def skip_execution_if(func):
    def warmup_wrapper(event, context):
        if event.get("source") == "serverless-plugin-warmup":
            print("WarmUp - Lambda is warm!")
            return {}
        return func(event, context)
    return warmup_wrapper


class DynamoQueryError(Exception):
    pass


class DynamoGetError(Exception):
    pass


class ModifyResponseError(Exception):
    pass


class DateConversionError(Exception):
    pass


class ProcessingInputError(Exception):
    pass


class FloatConversionError(Exception):
    pass


class GetReferenceListError(Exception):
    pass