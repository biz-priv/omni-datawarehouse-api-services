import os
import json
import logging
import botocore.session
session = botocore.session.get_session()

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

INTERNAL_ERROR_MESSAGE = "Internal Error."

def dynamo_query(table_name, index_name, expression, attributes):
    try:
        client = session.create_client('dynamodb', region_name=os.environ['REGION'])
        response = client.query(
            TableName=table_name,
            IndexName=index_name,
            KeyConditionExpression=expression,
            ExpressionAttributeValues=attributes
        )
        LOGGER.info("Dynamo query response: {}".format(json.dumps(response)))
        return response
    except Exception as dynamo_query_error:
        logging.exception("DynamoQueryError: %s",dynamo_query_error)
        raise DynamoQueryError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from dynamo_query_error

def dynamo_get(table_name, key):
    try:
        client = session.create_client('dynamodb', region_name=os.environ['REGION'])
        response = client.get_item(
            TableName=table_name,
            Key=key
        )
        LOGGER.info("Dynamo get response: %s",json.dumps(response))
        if "Item" in response:
            return response["Item"]
        else:
            return None
    except Exception as dynamo_get_error:
        logging.exception("DynamoGetError: %s",dynamo_get_error)
        raise DynamoGetError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from dynamo_get_error

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
        LOGGER.info("Process Input response: {}".format(json.dumps(execution_parameters)))
        return execution_parameters
    except Exception as input_error:
        logging.exception("ProcessingInputError: %s",input_error)
        raise ProcessingInputError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from input_error

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
        logging.exception("ModifyResponseError: %s",modify_error)
        raise ModifyResponseError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from modify_error

def modify_date(x):
    try:
        if x == None:
            return None
        else:
            return x.isoformat()
    except Exception as date_conversion_error:
        logging.exception("DateConversionError: %s", date_conversion_error)
        raise DateConversionError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from date_conversion_error

def modify_float(x):
    try:
        if x == None:
            return None
        else:
            return float(x)
    except Exception as float_conversion_error:
        logging.exception("FloatConversionError: %s", float_conversion_error)
        raise FloatConversionError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from float_conversion_error

def dynamo_put(table_name, items):
    try:
        client = session.create_client('dynamodb', region_name=os.environ['REGION'])
        response = client.put_item(
            TableName=table_name,
            Item= items
        )
        LOGGER.info("Dynamo put response: {}".format(json.dumps(response)))
        return response
    except Exception as dynamo_query_error:
        logging.exception("DynamoPutError: %s",dynamo_query_error)
        raise DynamoPutError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from dynamo_query_error


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
class DynamoPutError(Exception):
    pass