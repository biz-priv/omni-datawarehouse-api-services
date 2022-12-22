import logging
import json
import os
import dicttoxml
import xmltodict
import requests
import boto3
import psycopg2
import pydash
from ast import literal_eval
from datetime import datetime
client = boto3.client('dynamodb')

logger = logging.getLogger()
logger.setLevel(logging.INFO)
dicttoxml.LOG.setLevel(logging.ERROR)

from src.common import dynamo_query
from src.common import skip_execution_if

InternalErrorMessage = "Internal Error."

@skip_execution_if
def handler(event,context):
    
    event["body"]["oShipData"] = literal_eval(str(event["body"]["oShipData"]).replace("Weight","Weigth"))
    truncate_description(event["body"]["oShipData"]["Shipment Line List"])
    logger.info("Event: %s", json.dumps(event))
    customer_id = validate_input(event)
    customer_info = validate_dynamodb(customer_id)
    logger.info("Customer Info: %s",customer_info)
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
    except Exception as transform_error:
        logging.exception("DataTransformError: %s",transform_error)
        raise DataTransformError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from transform_error

    temp_ship_data = ready_date_time(temp_ship_data)
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
                    <UserName>"""+os.environ["wt_soap_username"]+"""</UserName><Password>"""+os.environ["wt_soap_password"]+"""</Password>\
                    </AuthHeader></soap:Header><soap:Body><AddNewShipmentV3 \
                    xmlns="http://tempuri.org/"><oShipData>"""
    end = """</oShipData></AddNewShipmentV3></soap:Body></soap:Envelope>"""
    payload = start+ship_data+shipment_line_list+reference_list+accessorial_list+end
    logger.info("Payload xml data is : %s",payload)
    try:
        url = os.environ["URL"]
    except Exception as url_error:
        logger.exception("Environment variable URL not set.")
        raise EnvironmentVariableError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from url_error
    pars = {'op': 'AddNewShipmentV3'}
    try:
        wt_response = requests.post(url, headers = {'Content-Type': 'text/xml; charset=utf-8'},data = payload, params = pars)
        response = wt_response.text
        logger.info("Response is : %s",response)
    except Exception as airtrak_error:
        logger.exception("AirtrakShipmentApiError: %s",airtrak_error)
        raise AirtrakShipmentApiError(json.dumps({"httpStatus": 400, "message": "WorldTrack Airtrak Shipment Api Error"})) from airtrak_error

    shipment_data = update_response(response)
    update_authorizer_table(shipment_data,customer_id)
    house_bill_info = temp_ship_data["AddNewShipmentV3"]["oShipData"]
    logger.info("House Bill Details are: %s",house_bill_info)
    service_level_desc = get_service_level(event["body"]["oShipData"])
    update_shipment_table(shipment_data,house_bill_info, service_level_desc)
    return shipment_data

def ready_date_time(old_shipment_list):
    try:
        updated_shipment_list = {}
        ReadyTime = old_shipment_list["AddNewShipmentV3"]["oShipData"]["ReadyDate"]
        updated_shipment_list["ReadyTime"] = ReadyTime
        if "CloseTime" in old_shipment_list["AddNewShipmentV3"]["oShipData"]:
            CloseDate = old_shipment_list["AddNewShipmentV3"]["oShipData"]["CloseTime"]
            updated_shipment_list["CloseDate"] = CloseDate
        elif "CloseDate" in old_shipment_list["AddNewShipmentV3"]["oShipData"]:
            CloseTime = old_shipment_list["AddNewShipmentV3"]["oShipData"]["CloseDate"]
            updated_shipment_list["CloseTime"] = CloseTime
        else:
            pass
        updated_shipment_list.update(old_shipment_list["AddNewShipmentV3"]["oShipData"])
        updated_shipment_list = pydash.objects.set_({}, 'AddNewShipmentV3.oShipData', updated_shipment_list)
        return updated_shipment_list
    except Exception as ready_datetime_error:
        logging.exception("ReadyDateTimeError: %s",ready_datetime_error)
        raise ReadyDateTimeError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from ready_datetime_error

def get_service_level(service_level_code):
    try:
        if "Service Level" in service_level_code:
            service_level_id = service_level_code['Service Level']
            con = psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
                                port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
            con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
            cur = con.cursor()
            cur.execute(f"select trim(service_level_desc) from public.service_level where service_level_id = '{service_level_id}'")
            con.commit()
            service_code = cur.fetchone()
            service_level_desc = service_code[0]
            cur.close()
            con.close()
            return service_level_desc
        return "NA"
    except Exception as service_level_error:
        logging.exception("GetServiceLevelError: %s", service_level_error)
        raise GetServiceLevelError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from service_level_error

def truncate_description(value):
    for i in value:
        if len(i["Description"]) >= 35:
            i["Description"] = i["Description"][:35]
        else:
            pass

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
        return response['Items'][0]
    except Exception as validate_error:
        logging.exception("ValidateDynamoDBError: %s", validate_error)
        raise ValidateDynamoDBError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from validate_error

def update_response(response):
    try:
        shipment_details = []
        temp_shipment_details = xmltodict.parse(response)
        temp_shipment_details = json.dumps(temp_shipment_details)
        temp_shipment_details = json.loads(temp_shipment_details)
        logger.info("Test Shipment Details are: %s",temp_shipment_details)
        shipment_details = temp_shipment_details["soap:Envelope"]["soap:Body"]["AddNewShipmentV3Response"]["AddNewShipmentV3Result"]
        temp_data = ['ErrorMessage','DestinationAirport']
        for i in temp_data:
            shipment_details.pop(i)
        logger.info("Shipment Details are: %s",shipment_details)
        return shipment_details
    except KeyError as wt_bol_error:
        logging.exception("WtBolApiError: %s", wt_bol_error)
        raise WtBolApiError(json.dumps({"httpStatus": 400, "message": "World Track Create Shipment API Error."})) from wt_bol_error
    except Exception as update_response_error:
        logging.exception("UpdateResponseError: %s", update_response_error)
        raise UpdateResponseError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from update_response_error

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
    except Exception as update_authorizer_error:
        logging.exception("UpdateAuthorizerTableError: %s",update_authorizer_error)
        raise UpdateAuthorizerTableError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from update_authorizer_error

now = datetime.now()
dt_iso = now.isoformat()

def update_shipment_table(shipment_data,house_bill_info,service_level_desc):
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
        shipment_info['Service Level Description'] = {'S': service_level_desc}
        shipment_info['File Date'] = {'S': dt_iso}
        shipment_items = ['ServiceLevel','ShipperName', 'ConsigneeName']
        for k,v in house_bill_info.items():
            if k in shipment_items:
                shipment_info[k] = {'S': v}
        logger.info("DynamoDB Data is: %s",shipment_info)
        response = client.put_item(
            TableName = os.environ['SHIPMENT_DETAILS_TABLE'],
            Item = shipment_info
        )
        return response
    except Exception as update_shipment_error:
        logging.exception("UpdateShipmentTableError: %s",update_shipment_error)
        raise UpdateShipmentTableError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from update_shipment_error

def get_shipment_line_list(data_obj):
    try:
        if "Shipment Line List" in data_obj:
            temp_shipment_line_list = modify_object_keys(data_obj["Shipment Line List"])
            shipment_line_list_item = lambda x: 'NewShipmentDimLineV3'
            shipment_line_list = dicttoxml.dicttoxml(temp_shipment_line_list, \
                attr_type=False,custom_root='ShipmentLineList',item_func=shipment_line_list_item)
            shipment_line_list = str(shipment_line_list).\
                replace("""b'<?xml version="1.0" encoding="UTF-8" ?>""", """""").\
                replace("""</ShipmentLineList>'""","""</ShipmentLineList>""")
        else:
            shipment_line_list = ''
        return shipment_line_list
    except Exception as shipment_linelist_error:
        logging.exception("GetShipmentLineListError: %s",shipment_linelist_error)
        raise GetShipmentLineListError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from shipment_linelist_error

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
    except Exception as reference_list_error:
        logging.exception("GetReferenceListError: %s",reference_list_error)
        raise GetReferenceListError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from reference_list_error

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
    except Exception as accessorial_list_error:
        logging.exception("GetAccessorialListError: %s",accessorial_list_error)
        raise GetAccessorialListError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage})) from accessorial_list_error

def validate_input(event):
    if not "enhancedAuthContext" in event or "customerId" not in event["enhancedAuthContext"]:
        raise InputError(json.dumps({"httpStatus": 400, "message": "CustomerId not found."}))
    client_data = ['Service Level','Ready Date']
    if not "body" in event or not "oShipData" in event["body"] or not set(client_data).issubset(event["body"]["oShipData"]):
        raise InputError(json.dumps({"httpStatus": 400, "message": "One/All of: Service Level, Ready Date parameters are missing in the request body oShipData."}))
    return event["enhancedAuthContext"]["customerId"]

class InputError(Exception):
    pass
class HandlerError(Exception):
    pass
class ValidateDynamoDBError(Exception):
    pass
class UpdateResponseError(Exception):
    pass
class UpdateAuthorizerTableError(Exception):
    pass
class UpdateShipmentTableError(Exception):
    pass
class GetShipmentLineListError(Exception):
    pass
class GetReferenceListError(Exception):
    pass
class GetAccessorialListError(Exception):
    pass
class WtBolApiError(Exception):
    pass
class DataTransformError(Exception):
    pass
class EnvironmentVariableError(Exception):
    pass
class AirtrakShipmentApiError(Exception):
    pass
class GetServiceLevelError(Exception):
    pass
class ReadyDateTimeError(Exception):
    pass
