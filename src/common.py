import os
import json
import logging
from datetime import datetime,timezone
import botocore.session
session = botocore.session.get_session()

logger = logging.getLogger()
logger.setLevel(logging.INFO)

InternalErrorMessage = "Internal Error."


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
        raise DynamoQueryError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

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
        raise DynamoGetError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

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
        return execution_parameters
    except Exception as e:
        logging.exception("ProcessingInputError: {}".format(e))
        raise ProcessingInputError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))


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
        response["Current Status Description"] = data[0]["ShipmentStatusDescription"]["S"]
        response["File Date"] = data[0]["File Date"]["S"]
        return [response]
    except Exception as e:
        logging.exception("ModifyResponseError: {}".format(e))
        raise ModifyResponseError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def modify_date(x):
    try:
        if x == None:
            return None
        else:
            return x.isoformat()
    except Exception as e:
        logging.exception("DateConversionError: {}".format(e))
        raise DateConversionError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

class DynamoQueryError(Exception): pass
class DynamoGetError(Exception): pass
class ModifyResponseError(Exception): pass
class DateConversionError(Exception): pass
class ProcessingInputError(Exception): pass