import json
import os
import dicttoxml
import xmltodict
import requests
import logging
import boto3
client = boto3.client('dynamodb')
import xml.etree.ElementTree as ET

logger = logging.getLogger()
logger.setLevel(logging.INFO)

from src.common import dynamo_query

InternalErrorMessage = "Internal Error."

def handler(event, context):
    logger.info("Event: {}".format(json.dumps(event)))
    customer_id = validate_input(event)
    customer_info = validate_dynamodb(customer_id)
    logger.info("Customer Info: {}".format(customer_info))
    if customer_info == 'Failure':
        return {"httpStatus": 400, "message": "Customer Information doesnot exist. Please raise a support ticket to add the customer"}
    try:
        event["body"]["oShipData"]["Station"] = customer_info['Station']['S']
        event["body"]["oShipData"]["CustomerNo"] = customer_info['CustomerNo']['S']
        event["body"]["oShipData"]["BillToAcct"] = customer_info['BillToAcct']['S']
        event["body"]["oShipData"]["DeclaredType"] = customer_info['DeclaredType']['S']
        temp_ship_data = {}
        temp_ship_data["AddNewShipmentV3"] = {}
        temp_ship_data["AddNewShipmentV3"]["oShipData"] = {}
        for key in event["body"]["oShipData"]:
            if type(event["body"]["oShipData"][key]) is str:
                new_key = key.replace(" ", "")
                temp_ship_data["AddNewShipmentV3"]["oShipData"][new_key] = event["body"]["oShipData"][key]
    except Exception as e:
        logging.exception("DataTransformError: {}".format(e))
        raise DataTransformError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

    shipment_line_list = get_shipment_line_list(event["body"]["oShipData"])
    reference_list = get_reference_list(event["body"]["oShipData"])
    accessorial_list = get_accessorial_list(event["body"]["oShipData"])
    ship_data=dicttoxml.dicttoxml(temp_ship_data, attr_type=False,custom_root='soap:Body')
    ship_data = str(ship_data).\
        replace("""b'<?xml version="1.0" encoding="UTF-8" ?><soap:Body><AddNewShipmentV3><oShipData>""", """""").\
        replace("""</oShipData></AddNewShipmentV3></soap:Body>'""","""""")
    start = """<?xml version="1.0" encoding="utf-8" ?><soap:Envelope \
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \
        xmlns:xsd="http://www.w3.org/2001/XMLSchema" \
            xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header><AuthHeader xmlns="http://tempuri.org/"> \
                    <UserName>biztest</UserName><Password>Api081020!</Password>\
                    </AuthHeader></soap:Header><soap:Body><AddNewShipmentV3 \
                    xmlns="http://tempuri.org/"><oShipData>"""
    end = """</oShipData></AddNewShipmentV3></soap:Body></soap:Envelope>"""
    payload = start+ship_data+shipment_line_list+reference_list+accessorial_list+end
    logger.info("Payload xml data is : {}".format(payload))
    try:
        url = os.environ["URL"]
    except Exception as e:
        logger.exception("Environment variable URL not set.")
        raise EnvironmentVariableError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))
    pars = {'op': 'AddNewShipmentV3'}
    try:
        r = requests.post(url, headers = {'Content-Type': 'text/xml; charset=utf-8'},data = payload, params = pars)
        response = r.text
        logger.info("Response is : {}".format(response))
    except Exception as e:
        logger.exception("AirtrakShipmentApiError: {}".format(e))
        raise AirtrakShipmentApiError(json.dumps({"httpStatus": 400, "message": "WorldTrack Airtrak Shipment Api Error"}))

    shipment_data = update_response(response)
    print("Shipment data is : " shipment_data)
    update_authorizer_table(shipment_data,customer_id)
    house_bill_info = temp_ship_data["AddNewShipmentV3"]["oShipData"]
    logger.info("House Bill Details are: {}".format(house_bill_info))
    update_shipment_table(shipment_data,house_bill_info)
    return shipment_data

def modify_object_keys(array):
    new_array = []
    for obj in array:
        new_obj = {}
        for key in obj:
            new_key = key.replace(" ","")
            new_obj[new_key] = obj[key]
        new_array.append(new_obj)
    return new_array

def validate_dynamodb(customer_id):
    try:
        response = dynamo_query(os.environ['ACCOUNT_INFO_TABLE'], os.environ['ACCOUNT_INFO_TABLE_INDEX'],
                        'CustomerID = :CustomerID', {":CustomerID": {"S": customer_id}})
        if not response['Items']:
            return 'Failure'
        else:
            return response['Items'][0]
    except Exception as e:
        logging.exception("ValidateDynamoDBError: {}".format(e))
        raise ValidateDynamoDBError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def update_response(response):
    try:
        shipment_details = []
        temp_shipment_details = xmltodict.parse(response)
        temp_shipment_details = json.dumps(temp_shipment_details)
        temp_shipment_details = json.loads(temp_shipment_details)
        logger.info("Test Shipment Details are: {}".format(temp_shipment_details))
        shipment_details = temp_shipment_details["soap:Envelope"]["soap:Body"]["AddNewShipmentV3Response"]["AddNewShipmentV3Result"]
        temp_data = ['ErrorMessage','DestinationAirport']
        for i in temp_data:
            shipment_details.pop(i)
        logger.info("Shipment Details are: {}".format(shipment_details))
        return shipment_details
    except KeyError as e:
        logging.exception("WtBolApiError: {}".format(e))
        raise WtBolApiError(json.dumps({"httpStatus": 400, "message": "World Track Create Shipment API Error."}))
    except Exception as e:
        logging.exception("UpdateResponseError: {}".format(e))
        raise UpdateResponseError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def update_authorizer_table(shipment_data,customer_id):
    try:
        house_bill_no = shipment_data['Housebill']
        file_no = shipment_data['ShipQuoteNo']
        response = client.put_item(
            TableName = os.environ['CUSTOMER_ENTITLEMENT_TABLE'],
            Item={
                'FileNumber': {
                'S': file_no
                },
                'HouseBillNumber':{
                'S': house_bill_no
                },
                'CustomerID': {
                'S': customer_id
                }
            }
        )
        return response
    except Exception as e:
        logging.exception("UpdateAuthorizerTableError: {}".format(e))
        raise UpdateAuthorizerTableError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def update_shipment_table(shipment_data,house_bill_info):
    try:
        temp_data = ['CustomerNo','BillToAcct']
        for i in temp_data:
            house_bill_info.pop(i)
        house_bill_no = shipment_data['Housebill']
        file_number = shipment_data['ShipQuoteNo']
        shipment_info = {}
        shipment_info['HouseBillNumber'] = {'S': house_bill_no}
        shipment_info['FileNumber'] = {'S': file_number}
        shipment_info['RecordStatus'] = {'S': 'True'}
        shipment_info['ShipmentStatus'] = {'S': 'Pending'}
        shipment_info['ShipmentStatusDescription'] = {'S': 'Pending'}
        shipment_items = ['ServiceLevel','ShipperName', 'ConsigneeName']
        for k,v in house_bill_info.items():
            if k in shipment_items:
                shipment_info[k] = {'S': v}
        logger.info("DynamoDB Data is: {}".format(shipment_info))
        response = client.put_item(
            TableName = os.environ['SHIPMENT_DETAILS_TABLE'],
            Item = shipment_info
        )
        return response
    except Exception as e:
        logging.exception("UpdateShipmentTableError: {}".format(e))
        raise UpdateShipmentTableError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def get_shipment_line_list(data_obj):
    try:
        if "Shipment Line List" in data_obj:
            temp_shipment_line_list = modify_object_keys(data_obj["Shipment Line List"])
            shipment_line_list_item = lambda x: 'NewShipmentDimLineV3'
            shipment_line_list=dicttoxml.dicttoxml(temp_shipment_line_list, \
                attr_type=False,custom_root='ShipmentLineList',item_func=shipment_line_list_item)
            shipment_line_list = str(shipment_line_list).\
                replace("""b'<?xml version="1.0" encoding="UTF-8" ?>""", """""").\
                replace("""</ShipmentLineList>'""","""</ShipmentLineList>""")
        else:
            shipment_line_list = ''
        return shipment_line_list
    except Exception as e:
        logging.exception("GetShipmentLineListError: {}".format(e))
        raise GetShipmentLineListError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def get_reference_list(data_obj):
    try:
        if "Reference List" in data_obj:
            temp_reference_list = modify_object_keys(data_obj["Reference List"])
            for item in temp_reference_list:
                item.update({"CustomerTypeV3":"BillTo"})
                item.update({"RefTypeId":"REF"})
            reference_list_item = lambda x: 'NewShipmentRefsV3'
            reference_list=dicttoxml.dicttoxml(temp_reference_list, \
                attr_type=False,custom_root='ReferenceList',item_func=reference_list_item)
            reference_list = str(reference_list).\
                replace("""b'<?xml version="1.0" encoding="UTF-8" ?>""", """""").\
                replace("""</ReferenceList>'""","""</ReferenceList>""")
        else:
            reference_list = ''
        return reference_list
    except Exception as e:
        logging.exception("GetReferenceListError: {}".format(e))
        raise GetReferenceListError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def get_accessorial_list(data_obj):
    try:
        if "New Shipment Accessorials List" in data_obj:
            temp_accessorials_list = modify_object_keys(data_obj["New Shipment Accessorials List"])
            accessorial_list_item = lambda x: 'NewShipmentAcessorialsV3'
            accessorial_list=dicttoxml.dicttoxml(temp_accessorials_list, attr_type=False,\
                custom_root='NewShipmentAcessorialsList',item_func=accessorial_list_item)
            accessorial_list = str(accessorial_list).\
                replace("""b'<?xml version="1.0" encoding="UTF-8" ?>""", """""").\
                replace("""</NewShipmentAcessorialsList>'""","""</NewShipmentAcessorialsList>""")
        else:
            accessorial_list = ''
        return accessorial_list
    except Exception as e:
        logging.exception("GetAccessorialListError: {}".format(e))
        raise GetAccessorialListError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def validate_input(event):
    if not "enhancedAuthContext" in event or "customerId" not in event["enhancedAuthContext"]:
        raise InputError(json.dumps({"httpStatus": 400, "message": "CustomerId not found."}))
    client_data = ['Service Level','Ready Date']
    if not "body" in event or not "oShipData" in event["body"] or not set(client_data).issubset(event["body"]["oShipData"]):
        raise InputError(json.dumps({"httpStatus": 400, "message": "One/All of: Service Level, Ready Date parameters are missing in the request body oShipData."}))
    return event["enhancedAuthContext"]["customerId"]

class InputError(Exception): pass
class HandlerError(Exception): pass
class ValidateDynamoDBError(Exception): pass
class UpdateResponseError(Exception): pass
class UpdateAuthorizerTableError(Exception): pass
class UpdateShipmentTableError(Exception): pass
class GetShipmentLineListError(Exception): pass
class GetReferenceListError(Exception): pass
class GetAccessorialListError(Exception):pass
class WtBolApiError(Exception): pass
class DataTransformError(Exception): pass
class EnvironmentVariableError(Exception): pass
class AirtrakShipmentApiError(Exception): pass