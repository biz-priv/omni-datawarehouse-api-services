from re import template
from src.common import dynamo_query
from src.common import skip_execution_if
from src.common import send_notification_to_sns

import logging
import dicttoxml
import json
import os
import xmltodict
import requests
import boto3
import psycopg2
import pydash
from ast import literal_eval
from datetime import date
client = boto3.client('dynamodb')

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

dicttoxml.LOG.setLevel(logging.ERROR)


INTERNAL_ERROR_MESSAGE = "Internal Error."


@skip_execution_if
def handler(event, context):
    try:
        LOGGER.info("Event: %s", event)
        # event["body"]["shipmentCreateRequest"] = literal_eval(
        #     str(event["body"]["shipmentCreateRequest"]).replace("Weight", "Weigth"))

        customer_id = validate_input(event)
        if(customer_id != 'customer-portal-admin'):
            customer_info = validate_dynamodb(customer_id)
            for key in ['controllingStation', 'customerNumber']:
                if key not in event["body"]["shipmentCreateRequest"] and key == 'controllingStation':
                    event["body"]["shipmentCreateRequest"]["Station"] = customer_info['Station']['S']

                if key not in event["body"]["shipmentCreateRequest"] and key == 'customerNumber':
                    event["body"]["shipmentCreateRequest"]["CustomerNo"] = customer_info['CustomerNo']['S']
                    event["body"]["shipmentCreateRequest"]["BillToAcct"] = customer_info['BillToAcct']['S']

            if customer_info == 'Failure':
                return {"httpStatus": 400, "message": "Customer Information does not exist. Please raise a support ticket to add the customer"}

        try:
            temp_ship_data = {}
            temp_ship_data["AddNewShipmentV3"] = {}
            temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"] = {}
            for key in event["body"]["shipmentCreateRequest"]:
                if type(event["body"]["shipmentCreateRequest"][key]) is str:
                    new_key = key.replace(" ", "")
                    new_key = new_key[0].capitalize() + new_key[1:]
                    if(key == 'incoterm'):
                        new_key = 'IncoTermsCode'
                        event["body"]["shipmentCreateRequest"][key] = event["body"]["shipmentCreateRequest"][key][0:3].upper()
                    elif(key == 'customerNumber'):
                        new_key = 'CustomerNo'
                    elif(key == 'billTo'):
                        new_key = 'PayType'
                        temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"]["BillToAcct"] = event["body"]["shipmentCreateRequest"][key]
                    elif(key == 'controllingStation'):
                        new_key = 'Station'
                        event["body"]["shipmentCreateRequest"][key] = event["body"]["shipmentCreateRequest"][key][0:3].upper()
                    elif(key == 'UserID'):
                        new_key = 'WebtrakUserID'
                    elif(key == 'mode'):
                        if(event["body"]["shipmentCreateRequest"][key] == 'FTL' or event["body"]["shipmentCreateRequest"][key] == 'Truckload'):
                            event["body"]["shipmentCreateRequest"][key] = 'Truckload'
                        else:
                            event["body"]["shipmentCreateRequest"][key] = 'Domestic'
                    elif(key == 'deliveryWindowFrom'):
                        new_key = 'DeliveryTime'
                    elif(key == 'deliveryWindowTo'):
                        new_key = 'DeliveryTime2'
                    elif(key == 'delBy'):
                        if(event["body"]["shipmentCreateRequest"][key].lower() in ['between', 'by', 'only']):
                            event["body"]["shipmentCreateRequest"][key] = event["body"]["shipmentCreateRequest"][key].capitalize(
                            )
                        else:
                            event["body"]["shipmentCreateRequest"][key] = 'By'
                    elif(key == 'serviceLevel'):
                        acceptableServiceLevelCodes = ['2A', '2D', '3A', '3D', '4D', 'A1', 'A5', 'AD', 'AE', 'AG', 'AI', 'AP', 'AV', 'BA', 'BC', 'BH', 'BO', 'BR', 'CC', 'CH', 'CO', 'DR', 'EC', 'FT', 'GM', 'GO', 'HD', 'HS', 'IG', 'IM',
                                                    'LO', 'LP', 'LT', 'NA', 'ND', 'NF', 'NT', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O8', 'OC', 'OI', 'OS', 'OV', 'PL', 'PT', 'QU', 'R2', 'R3', 'RA', 'RE', 'RN', 'RT', 'SM', 'ST', 'TD', 'TR', 'UP', 'VZ', 'WS', 'XD']
                        event["body"]["shipmentCreateRequest"][key] = event["body"]["shipmentCreateRequest"][key][0:2].upper()
                        if(event["body"]["shipmentCreateRequest"][key] not in acceptableServiceLevelCodes):
                            continue
                    elif(key == 'projectCode'):
                        event["body"]["shipmentCreateRequest"][key] = event["body"]["shipmentCreateRequest"][key][0:32]
                    elif(key == 'readyTime' and ('readyDate' not in event["body"]["shipmentCreateRequest"])):
                        temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"]['ReadyDate'] = event["body"]["shipmentCreateRequest"][key]
                    elif(key == 'readyDate' and ('readyTime' not in event["body"]["shipmentCreateRequest"])):
                        temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"]['ReadyTime'] = event["body"]["shipmentCreateRequest"][key]
                    # LOGGER.info("New Key: %s",new_key)
                    temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"][new_key] = event["body"]["shipmentCreateRequest"][key]
            if('accessorialList' in event["body"]["shipmentCreateRequest"]):
                temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"]['PickupInstructions'] = ','.join(
                    event["body"]["shipmentCreateRequest"]['accessorialList'])
            try:
                if('insuredValue' in event["body"]["shipmentCreateRequest"] and isinstance(float(event["body"]["shipmentCreateRequest"]["insuredValue"]), float) and float(event["body"]["shipmentCreateRequest"]["insuredValue"]) >= 0):
                    temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"]['DeclaredType'] = 'INSP'
                    temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"][
                        'DeclaredValue'] = event["body"]["shipmentCreateRequest"]["insuredValue"]
                else:
                    temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"]['DeclaredType'] = 'LL'
            except (ValueError):
                LOGGER.info('string exception')
                temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"]['DeclaredType'] = 'LL'
            if('shipper' in event["body"]["shipmentCreateRequest"]):
                for key in event["body"]["shipmentCreateRequest"]["shipper"]:
                    new_key = "Shipper"+key[0].capitalize()+key[1:]
                    if(key == 'address'):
                        new_key = "ShipperAddress1"
                    elif(key == 'venueName'):
                        new_key = "ShipperShowVenue"
                    elif(key == 'booth'):
                        new_key = "ShipperShowBooth"
                    elif(key == 'decorator'):
                        new_key = "ShipperShowDecorator"
                    temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"][new_key] = event["body"]["shipmentCreateRequest"]["shipper"][key]
            if('consignee' in event["body"]["shipmentCreateRequest"]):
                for key in event["body"]["shipmentCreateRequest"]["consignee"]:
                    new_key = "Consignee"+key[0].capitalize()+key[1:]
                    if(key == 'address'):
                        new_key = "ConsigneeAddress1"
                    elif(key == 'venueName'):
                        new_key = "ConsigneeShowVenue"
                    elif(key == 'booth'):
                        new_key = "ConsigneeShowBooth"
                    elif(key == 'decorator'):
                        new_key = "ConsigneeShowDecorator"
                    temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"][
                        new_key] = event["body"]["shipmentCreateRequest"]["consignee"][key]
        except Exception as transform_error:
            logging.exception("DataTransformError: %s", transform_error)
            raise DataTransformError(json.dumps(
                {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from transform_error

        temp_ship_data = ready_date_time(temp_ship_data)
        shipment_line_list = get_shipment_line_list(
            event["body"]["shipmentCreateRequest"])
        reference_list = get_reference_list(event["body"]["shipmentCreateRequest"])
        accessorial_list = get_accessorial_list(
            event["body"]["shipmentCreateRequest"])

        ship_data = dicttoxml.dicttoxml(
            temp_ship_data, attr_type=False, custom_root='soap:Body')
        ship_data = str(ship_data).\
            replace("""b'<?xml version="1.0" encoding="UTF-8" ?><soap:Body><AddNewShipmentV3><shipmentCreateRequest>""", """""").\
            replace("""</shipmentCreateRequest></AddNewShipmentV3></soap:Body>'""", """""")
        start = """<?xml version="1.0" encoding="utf-8" ?><soap:Envelope \
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \
            xmlns:xsd="http://www.w3.org/2001/XMLSchema" \
                xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header><AuthHeader xmlns="http://tempuri.org/"> \
                        <UserName>""" + os.environ["wt_soap_username"]+"""</UserName><Password>"""+os.environ["wt_soap_password"]+"""</Password>\
                        </AuthHeader></soap:Header><soap:Body><AddNewShipmentV3 \
                        xmlns="http://tempuri.org/"><oShipData>"""
        end = """</oShipData></AddNewShipmentV3></soap:Body></soap:Envelope>"""
        payload = start+ship_data+shipment_line_list+reference_list+accessorial_list+end
        LOGGER.info("Payload xml data is : %s", json.dumps(payload))
        try:
            url = os.environ["URL"]
        except Exception as url_error:
            LOGGER.exception("Environment variable URL not set.")
            raise EnvironmentVariableError(json.dumps(
                {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from url_error
        pars = {'op': 'AddNewShipmentV3'}
        try:
            req = requests.post(url, headers={
                                'Content-Type': 'text/xml; charset=utf-8'}, data=payload, params=pars)
            response = req.text
            LOGGER.info("Response is : %s", json.dumps(response))
        except Exception as airtrak_error:
            LOGGER.exception("AirtrakShipmentApiError: %s",
                            json.dumps(airtrak_error))
            raise AirtrakShipmentApiError(json.dumps(
                {"httpStatus": 400, "message": "WorldTrack Airtrak Shipment Api Error"})) from airtrak_error

        shipment_data = update_response(response)
        add_tracking_notes( shipment_data["shipmentCreateResponse"]["housebill"] , event["body"]["shipmentCreateRequest"]["UserID"] )

        update_authorizer_table(shipment_data, customer_id)
        house_bill_info = temp_ship_data["AddNewShipmentV3"]["shipmentCreateRequest"]
        LOGGER.info("House Bill Details are: %s", json.dumps(house_bill_info))
        service_level_desc = get_service_level(
            event["body"]["shipmentCreateRequest"])
        current_date = (date.today()).strftime("%Y-%m-%d")
        update_shipment_table(shipment_data, house_bill_info,
                            service_level_desc, current_date)
        return shipment_data
    
    except Exception as error:
        send_notification_to_sns(str(error))






def ready_date_time(old_shipment_list):
    try:
        updated_shipment_list = {}
        ready_time = old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"]["ReadyTime"]
        updated_shipment_list["ReadyTime"] = ready_time
        updated_shipment_list["ReadyDate"] = ready_time

        if("DeliveryTime" in old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"]):
            delivery_from = old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"]["DeliveryTime"]
            if(delivery_from == '' or len(delivery_from) < 25):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'DeliveryTime')
            elif ((delivery_from[4] or delivery_from[7] or delivery_from[19]) != '-' or not(delivery_from[0:4].isnumeric() and delivery_from[5:7].isnumeric() and delivery_from[8:10].isnumeric() and delivery_from[11:13].isnumeric() and delivery_from[14:16].isnumeric() and delivery_from[17:19].isnumeric() and delivery_from[20:22].isnumeric() and delivery_from[23:25].isnumeric()) or (delivery_from[13] or delivery_from[16] or delivery_from[22]) != ':' or delivery_from[10] != 'T'):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'DeliveryTime')
            elif(delivery_from[5:7] in ['09', '04', '06', '11'] and int(delivery_from[8:10]) > 30 or delivery_from[5:7] not in ['09', '04', '06', '11'] and int(delivery_from[8:10]) > 31 or delivery_from[5:7] == '02' and int(delivery_from[8:10]) > 28):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'DeliveryTime')
            else:
                updated_shipment_list["DeliveryTime"] = delivery_from
                updated_shipment_list["DeliveryDate"] = delivery_from
        if("DeliveryTime2" in old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"]):
            delivery_to = old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"]["DeliveryTime2"]
            if(delivery_to == '' or len(delivery_to) < 25):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'DeliveryTime2')
            elif ((delivery_to[4] or delivery_to[7] or delivery_to[19]) != '-' or not(delivery_to[0:4].isnumeric() and delivery_to[5:7].isnumeric() and delivery_to[8:10].isnumeric() and delivery_to[11:13].isnumeric() and delivery_to[14:16].isnumeric() and delivery_to[17:19].isnumeric() and delivery_to[20:22].isnumeric() and delivery_to[23:25].isnumeric()) or (delivery_to[13] or delivery_to[16] or delivery_to[22]) != ':' or delivery_to[10] != 'T'):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'DeliveryTime2')
            elif(delivery_to[5:7] in ['09', '04', '06', '11'] and int(delivery_to[8:10]) > 30 or delivery_to[5:7] not in ['09', '04', '06', '11'] and int(delivery_to[8:10]) > 31 or delivery_to[5:7] == '02' and int(delivery_to[8:10]) > 28):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'DeliveryTime2')
            else:
                updated_shipment_list["DeliveryTime2"] = delivery_to
        if "CloseDate" in old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"]:
            close_date = old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"]["CloseDate"]
            if(close_date == '' or len(close_date) < 25):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'CloseDate')
            elif ((close_date[4] or close_date[7] or close_date[19]) != '-' or not(close_date[0:4].isnumeric() and close_date[5:7].isnumeric() and close_date[8:10].isnumeric() and close_date[11:13].isnumeric() and close_date[14:16].isnumeric() and close_date[17:19].isnumeric() and close_date[20:22].isnumeric() and close_date[23:25].isnumeric()) or (close_date[13] or close_date[16] or close_date[22]) != ':' or close_date[10] != 'T'):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'CloseDate')
            elif(close_date[5:7] in ['09', '04', '06', '11'] and int(close_date[8:10]) > 30 or close_date[5:7] not in ['09', '04', '06', '11'] and int(close_date[8:10]) > 31 or close_date[5:7] == '02' and int(close_date[8:10]) > 28):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'CloseDate')
            else:
                updated_shipment_list["CloseDate"] = close_date
        elif "CloseTime" in old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"]:
            close_time = old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"]["CloseTime"]
            if(close_time == '' or len(close_time) < 25):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'CloseTime')
            elif ((close_time[4] or close_time[7] or close_time[19]) != '-' or not(close_time[0:4].isnumeric() and close_time[5:7].isnumeric() and close_time[8:10].isnumeric() and close_time[11:13].isnumeric() and close_time[14:16].isnumeric() and close_time[17:19].isnumeric() and close_time[20:22].isnumeric() and close_time[23:25].isnumeric()) or (close_time[13] or close_time[16] or close_time[22]) != ':' or close_time[10] != 'T'):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'CloseTime')
            elif(close_time[5:7] in ['09', '04', '06', '11'] and int(close_time[8:10]) > 30 or close_time[5:7] not in ['09', '04', '06', '11'] and int(close_time[8:10]) > 31 or close_time[5:7] == '02' and int(close_time[8:10]) > 28):

                old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"].pop(
                    'CloseTime')
            else:
                updated_shipment_list["CloseTime"] = close_time
        else:
            pass

        updated_shipment_list.update(
            old_shipment_list["AddNewShipmentV3"]["shipmentCreateRequest"])
        updated_shipment_list = pydash.objects.set_(
            {}, 'AddNewShipmentV3.shipmentCreateRequest', updated_shipment_list)
        return updated_shipment_list
    except Exception as ready_date_error:
        logging.exception("ReadyDateTimeError: %s", ready_date_error)
        raise ReadyDateTimeError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from ready_date_error


def get_service_level(service_level_code):
    try:
        if "serviceLevel" in service_level_code:
            service_level_id = service_level_code['serviceLevel']
            con = psycopg2.connect(dbname=os.environ['db_name'], host=os.environ['db_host'],
                                   port=os.environ['db_port'], user=os.environ['db_username'], password=os.environ['db_password'])
            con.set_isolation_level(
                psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
            cur = con.cursor()
            cur.execute(
                f"select trim(service_level_desc) from public.service_level where service_level_id = '{service_level_id}'")
            con.commit()
            service_code = cur.fetchone()
            service_level_desc = service_code[0]
            cur.close()
            con.close()
            return service_level_desc
        return "NA"
    except Exception as service_level_error:
        logging.exception("GetServiceLevelError: %s",
                          json.dumps(service_level_error))
        raise GetServiceLevelError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from service_level_error


def modify_object_keys(array):
    new_array = []
    for obj in array:
        new_obj = {}
        for key in obj:
            new_key = key.replace(" ", "")
            new_key = new_key[0].capitalize() + new_key[1:]
            if(key == 'weightUOM'):
                new_key = 'WeightUOMV3'
            elif(key == 'dimUOM'):
                new_key = 'DimUOMV3'
            elif(key == 'weight'):
                new_key = 'Weigth'
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
        logging.exception("ValidateDynamoDBError: %s",
                          json.dumps(validate_error))
        raise ValidateDynamoDBError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from validate_error


def update_response(response):
    try:
        shipment_details = []
        temp_shipment_details = xmltodict.parse(response)
        temp_shipment_details = json.dumps(temp_shipment_details)
        temp_shipment_details = json.loads(temp_shipment_details)
        LOGGER.info("Test Shipment Details are: %s",
                    json.dumps(temp_shipment_details))
        shipment_details = temp_shipment_details["soap:Envelope"][
            "soap:Body"]["AddNewShipmentV3Response"]["AddNewShipmentV3Result"]
        temp_data = ['DestinationAirport']
        for i in temp_data:
            shipment_details.pop(i)
        new_ship_details = {}
        new_ship_details["shipmentCreateResponse"] = {}
        for key in shipment_details:
            if(key == 'ShipQuoteNo'):
                new_ship_details["shipmentCreateResponse"]['fileNumber'] = shipment_details['ShipQuoteNo']
                # temp_data.append("ShipQuoteNo")
            if(key == 'Housebill'):
                new_ship_details["shipmentCreateResponse"]['housebill'] = shipment_details['Housebill']
                # temp_data.append("Housebill")
            if(key == 'ErrorMessage'):
                if(shipment_details['ErrorMessage'] != None):
                    new_ship_details["shipmentCreateResponse"]['errorMessage'] = shipment_details['ErrorMessage']
        LOGGER.info("Shipment Details are: %s", json.dumps(new_ship_details))
        return new_ship_details
    except KeyError as wt_error:
        logging.exception("WtBolApiError: %s", wt_error)
        raise WtBolApiError(json.dumps(
            {"httpStatus": 400, "message": "World Track Create Shipment API Error."})) from wt_error
    except Exception as update_error:
        logging.exception("UpdateResponseError: %s", json.dumps(update_error))
        raise UpdateResponseError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from update_error


def update_authorizer_table(shipment_data, customer_id):
    try:
        house_bill_no = shipment_data["shipmentCreateResponse"]['housebill']
        file_no = shipment_data["shipmentCreateResponse"]['fileNumber']
        response = client.put_item(
            TableName=os.environ['CUSTOMER_ENTITLEMENT_TABLE'],
            Item={
                'FileNumber': {
                    'S': file_no
                },
                'HouseBillNumber': {
                    'S': house_bill_no
                },
                'CustomerID': {
                    'S': customer_id
                }
            }
        )
        return response
    except Exception as update_dynamo_error:
        logging.exception("UpdateAuthorizerTableError: %s",
                          update_dynamo_error)
        raise UpdateAuthorizerTableError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from update_dynamo_error


def update_shipment_table(shipment_data, house_bill_info, service_level_desc, current_date):
    try:
        temp_data = ['CustomerNo']
        for i in temp_data:
            house_bill_info.pop(i)
        house_bill_no = shipment_data["shipmentCreateResponse"]['housebill']
        file_number = shipment_data["shipmentCreateResponse"]['fileNumber']
        shipment_info = {}
        shipment_info['HouseBillNumber'] = {'S': house_bill_no}
        shipment_info['FileNumber'] = {'S': file_number}
        shipment_info['RecordStatus'] = {'S': 'True'}
        shipment_info['ShipmentStatus'] = {'S': 'Pending'}
        shipment_info['ShipmentStatusDescription'] = {'S': 'Pending'}
        shipment_info['Service Level Description'] = {'S': service_level_desc}
        shipment_info['File Date'] = {'S': current_date}
        shipment_items = ['ServiceLevel', 'ShipperName', 'ConsigneeName']
        for keys, values in house_bill_info.items():
            if keys in shipment_items:
                shipment_info[keys] = {'S': values}
        LOGGER.info("DynamoDB Data is: %s", json.dumps(shipment_info))
        response = client.put_item(
            TableName=os.environ['SHIPMENT_DETAILS_TABLE'],
            Item=shipment_info
        )
        return response
    except Exception as update_dynamo_error:
        logging.exception("UpdateShipmentTableError: %s", update_dynamo_error)
        raise UpdateShipmentTableError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from update_dynamo_error


def get_shipment_line_list(data_obj):
    try:
        if "shipmentLines" in data_obj:
            temp_shipment_line_list = modify_object_keys(
                data_obj["shipmentLines"])
            for i in temp_shipment_line_list:
                if('Hazmat' in i):
                    if(str(i['Hazmat']).lower() in ['0', '1', 'true', 'false']):
                        i['Hazmat'] = str(i['Hazmat']).lower()
                    else:
                        i['Hazmat'] = 'false'
                if('WeightUOMV3' in i):
                    if str(i['WeightUOMV3']).lower() in ['lb', 'kg']:
                        i['WeightUOMV3'] = str(i['WeightUOMV3']).lower()
                    else:
                        i['WeightUOMV3'] = 'lb'
                if('DimUOMV3' in i):
                    if str(i['DimUOMV3']).lower() in ['in', 'cm']:
                        i['DimUOMV3'] = str(i['DimUOMV3']).lower()
                    else:
                        i['DimUOMV3'] = 'in'
                if('Description' in i):
                    i['Description'] = i['Description'][0:35]
                if('PieceType' in i):
                    i['PieceType'] = i['PieceType'][0:3]
                if('Pieces' in i):
                    try:
                        i['Pieces'] = int(i['Pieces'])
                        if(int(i['Pieces']) > 32767):
                            i.pop('Pieces')
                    except ValueError:
                        i.pop('Pieces')
                if('Length' in i):
                    try:
                        i['Length'] = int(i['Length'])
                        if(int(i['Length']) > 999):
                            i.pop('Length')
                    except ValueError:
                        i.pop('Length')
                if('Width' in i):
                    try:
                        i['Width'] = int(i['Width'])
                        if(int(i['Width']) > 999):
                            i.pop('Width')
                    except ValueError:
                        i.pop('Width')
                if('Weigth' in i):
                    try:
                        i['Weigth'] = int(i['Weigth'])
                        if(int(i['Weigth']) > 999):
                            i.pop('Weigth')
                    except ValueError:
                        i.pop('Weigth')

            def shipment_line_list_item(x): return 'NewShipmentDimLineV3'
            shipment_line_list = dicttoxml.dicttoxml(temp_shipment_line_list,
                                                     attr_type=False, custom_root='ShipmentLineList', item_func=shipment_line_list_item)
            shipment_line_list = str(shipment_line_list).\
                replace("""b'<?xml version="1.0" encoding="UTF-8" ?>""", """""").\
                replace("""</ShipmentLineList>'""", """</ShipmentLineList>""")
        else:
            shipment_line_list = ''
        return shipment_line_list
    except Exception as get_linelist_error:
        logging.exception("GetShipmentLineListError: %s",
                          json.dumps(get_linelist_error))
        raise GetShipmentLineListError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from get_linelist_error


def get_reference_list(data_obj):
    try:
        if "customerReference" in data_obj:
            temp_reference_list = modify_object_keys(
                data_obj["customerReference"])
            for bill_to_item in temp_reference_list:
                bill_to_item.update({"CustomerTypeV3": "BillTo"})
                bill_to_item.update({"RefTypeId": "REF"})

            def add_shipper(x):
                t = []
                m = []
                for bill_to_item in x:
                    if('RefParty' in bill_to_item):
                        if(bill_to_item['RefParty'].upper() in ['SHIPPER', 'BILLTO', 'CONSIGNEE']):
                            if('RefNumber' in bill_to_item and 'RefType' in bill_to_item):
                                t.append(
                                    {"ReferenceNo": bill_to_item['RefNumber'], "CustomerTypeV3": bill_to_item['RefParty'], "RefTypeId": bill_to_item['RefType']})
                            elif('RefNumber' in bill_to_item and 'RefType' not in bill_to_item):
                                t.append(
                                    {"ReferenceNo": bill_to_item['RefNumber'], "CustomerTypeV3": bill_to_item['RefParty']})
                            elif('RefType' in bill_to_item and 'RefNumber' not in bill_to_item):
                                t.append(
                                    {"RefTypeId": bill_to_item['RefType'], "CustomerTypeV3": bill_to_item['RefParty']})
                m.extend(t)
                return m
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
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from reference_list_error


def get_accessorial_list(data_obj):
    try:
        if "accessorialList" in data_obj:
            temp_accessorials_list = []
            for code in data_obj["accessorialList"]:
                new_obj = {}
                new_key = "Code"
                new_obj[new_key] = code
                temp_accessorials_list.append(new_obj)

            LOGGER.info("Temp Accessorial List Modify Keys: %s",
                        temp_accessorials_list)

            def accessorial_list_item(x): return "NewShipmentAcessorialsV3"
            accessorial_list = dicttoxml.dicttoxml(temp_accessorials_list, attr_type=False,
                                                   custom_root='NewShipmentAcessorialsList', item_func=accessorial_list_item)
            accessorial_list = str(accessorial_list).\
                replace("""b'<?xml version="1.0" encoding="UTF-8" ?>""", """""").\
                replace("""</NewShipmentAcessorialsList>'""",
                        """</NewShipmentAcessorialsList>""")
        else:
            accessorial_list = ''
        return accessorial_list
    except Exception as get_accessorial_error:
        logging.exception("GetAccessorialListError: %s", get_accessorial_error)
        raise GetAccessorialListError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from get_accessorial_error


def validate_input(event):
    if not "enhancedAuthContext" in event or "customerId" not in event["enhancedAuthContext"]:
        raise InputError(json.dumps(
            {"httpStatus": 400, "message": "CustomerId not found."}))
    if not "shipmentCreateRequest" in event["body"]:
        raise InputError(json.dumps(
            {"httpStatus": 400, "message": "shipmentCreateRequest must be sent"}))
    client_data = ['serviceLevel']
    # if not "body" in event or not "shipmentCreateRequest" in event["body"] or not set(client_data).issubset(event["body"]["shipmentCreateRequest"]):
    #     raise InputError(json.dumps(
    #         {"httpStatus": 400, "message": "Service Level is missing in the request body shipmentCreateRequest."}))
    if('readyTime' not in event["body"]["shipmentCreateRequest"] and 'readyDate' not in event["body"]["shipmentCreateRequest"]):
        raise InputError(json.dumps(
            {"httpStatus": 400, "message": "Ready Date/Time parameters are missing in the request body shipmentCreateRequest."}))
    elif('readyTime' in event["body"]["shipmentCreateRequest"] and 'readyDate' not in event["body"]["shipmentCreateRequest"]):
        if(event["body"]["shipmentCreateRequest"]['readyTime'] == ''):
            raise InputError(json.dumps(
                {"httpStatus": 400, "message": "Ready Date/Time parameters are missing in the request body shipmentCreateRequest."}))
        else:
            readyTime = event["body"]["shipmentCreateRequest"]['readyTime']
            if((readyTime[4] or readyTime[7] or readyTime[19]) != '-' or not(readyTime[0:4].isnumeric() and readyTime[5:7].isnumeric() and readyTime[8:10].isnumeric() and readyTime[11:13].isnumeric() and readyTime[14:16].isnumeric() and readyTime[17:19].isnumeric() and readyTime[20:22].isnumeric() and readyTime[23:25].isnumeric()) or (readyTime[13] or readyTime[16] or readyTime[22]) != ':' or readyTime[10] != 'T'):
                raise InputError(json.dumps(
                    {"httpStatus": 400, "message": 'readyTime is not in the correct date format.'}))
            elif(readyTime[5:7] in ['09', '04', '06', '11'] and int(readyTime[8:10]) > 30 or readyTime[5:7] not in ['09', '04', '06', '11'] and int(readyTime[8:10]) > 31 or readyTime[5:7] == '02' and int(readyTime[8:10]) > 28):
                raise InputError(json.dumps(
                    {"httpStatus": 400, "message": 'readyTime is not in the correct date format.'}))
    elif('readyDate' in event["body"]["shipmentCreateRequest"] and 'readyTime' not in event["body"]["shipmentCreateRequest"]):
        if(event["body"]["shipmentCreateRequest"]['readyDate'] == ''):
            raise InputError(json.dumps(
                {"httpStatus": 400, "message": "Ready Date/Time parameters are missing in the request body shipmentCreateRequest."}))
        else:
            readyTime = event["body"]["shipmentCreateRequest"]['readyDate']
            if((readyTime[4] or readyTime[7] or readyTime[19]) != '-' or not(readyTime[0:4].isnumeric() and readyTime[5:7].isnumeric() and readyTime[8:10].isnumeric() and readyTime[11:13].isnumeric() and readyTime[14:16].isnumeric() and readyTime[17:19].isnumeric() and readyTime[20:22].isnumeric() and readyTime[23:25].isnumeric()) or (readyTime[13] or readyTime[16] or readyTime[22]) != ':' or readyTime[10] != 'T'):
                raise InputError(json.dumps(
                    {"httpStatus": 400, "message": 'readyDate is not in the correct date format.'}))
            elif(readyTime[5:7] in ['09', '04', '06', '11'] and int(readyTime[8:10]) > 30 or readyTime[5:7] not in ['09', '04', '06', '11'] and int(readyTime[8:10]) > 31 or readyTime[5:7] == '02' and int(readyTime[8:10]) > 28):
                raise InputError(json.dumps(
                    {"httpStatus": 400, "message": 'readyDate is not in the correct date format.'}))
    elif('readyTime' in event["body"]["shipmentCreateRequest"] and 'readyDate' in event["body"]["shipmentCreateRequest"]):
        if(event["body"]["shipmentCreateRequest"]['readyDate'] == '' and event["body"]["shipmentCreateRequest"]['readyTime'] == ''):
            raise InputError(json.dumps(
                {"httpStatus": 400, "message": "Ready Date/Time parameters are missing in the request body shipmentCreateRequest."}))
        else:
            for ready in ['readyDate', 'readyTime']:
                readyTime = event["body"]["shipmentCreateRequest"][ready]
                if(event["body"]["shipmentCreateRequest"][ready] == ''):
                    print('removing '+ready+' from event body as it is empty')
                    event["body"]["shipmentCreateRequest"].pop(ready)
                elif((readyTime[4] or readyTime[7] or readyTime[19]) != '-' or not(readyTime[0:4].isnumeric() and readyTime[5:7].isnumeric() and readyTime[8:10].isnumeric() and readyTime[11:13].isnumeric() and readyTime[14:16].isnumeric() and readyTime[17:19].isnumeric() and readyTime[20:22].isnumeric() and readyTime[23:25].isnumeric()) or (readyTime[13] or readyTime[16] or readyTime[22]) != ':' or readyTime[10] != 'T'):
                    raise InputError(json.dumps(
                        {"httpStatus": 400, "message": ready + ' is not in the correct date format.'}))
                elif(readyTime[5:7] in ['09', '04', '06', '11'] and int(readyTime[8:10]) > 30 or readyTime[5:7] not in ['09', '04', '06', '11'] and int(readyTime[8:10]) > 31 or readyTime[5:7] == '02' and int(readyTime[8:10]) > 28):
                    raise InputError(json.dumps(
                        {"httpStatus": 400, "message": ready + ' is not in the correct date format.'}))
    else:
        acceptableStations = ['ACN', 'AUS', 'BNA', 'BOS', 'CVG', 'DAL', 'DFW', 'ELP', 'EXP', 'GSP', 'IAH',
                              'IND', 'LAX', 'LGB', 'MSP', 'OLH', 'ORD', 'OTR', 'PDX', 'PHL', 'SAN', 'SAT', 'SFO', 'SLC', 'YYZ']
        errors = []

        if(event["enhancedAuthContext"]["customerId"] == 'customer-portal-admin'):
            for req_field in ["controllingStation", "customerNumber"]:
                if req_field not in event["body"]["shipmentCreateRequest"]:
                    errors.append(req_field + " not in body")
                elif req_field == "customerNumber":
                    if not event["body"]["shipmentCreateRequest"][req_field].isnumeric():
                        errors.append(req_field + " must be an integer")
                    elif len(event["body"]["shipmentCreateRequest"][req_field]) > 6:
                        errors.append(
                            req_field + " must be less than 6 digits")
                elif req_field == 'controllingStation':
                    if event["body"]["shipmentCreateRequest"]["controllingStation"][0:3].upper() not in acceptableStations:
                        errors.append(event["body"]["shipmentCreateRequest"]
                                      [req_field] + '  is not a valid value for Station')
        # if(event["body"]["shipmentCreateRequest"]["serviceLevel"][0:2].upper() not in acceptableServiceLevelCodes):
        #     raise InputError(json.dumps(
        #     {"httpStatus": 400, "message":event["body"]["shipmentCreateRequest"]["serviceLevel"] + " is not a valid value for Service Level"}))

        if errors:
            LOGGER.info(", ".join(list(map(str, errors))))
            raise InputError(json.dumps(
                {"httpStatus": 400, "message": ", ".join(list(map(str, errors)))}))
    return event["enhancedAuthContext"]["customerId"]

def add_tracking_notes( housebill, username ):
    try:
        payload = f'''
        <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
            xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Header>
                <AuthHeader xmlns="http://tempuri.org/">
                    <UserName>{os.environ["wt_soap_username"]}</UserName>
                    <Password>{os.environ["wt_soap_password"]}</Password>
                </AuthHeader>
            </soap:Header>
            <soap:Body>
                <WriteTrackingNote xmlns="http://tempuri.org/">
                    <HandlingStation></HandlingStation>
                    <HouseBill>{housebill}</HouseBill>
                    <TrackingNotes>
                        <TrackingNotes>
                            <TrackingNoteMessage>Added by {username}</TrackingNoteMessage>
                        </TrackingNotes>
                    </TrackingNotes>
                </WriteTrackingNote>
            </soap:Body>
        </soap:Envelope>
        '''
        LOGGER.info("Payload is : %s", json.dumps(payload))
        url = os.environ["URL"]
        req = requests.post(url, headers={'Content-Type': 'text/xml; charset=utf-8'}, data=payload)
        response = req.text
        LOGGER.info("Response is : %s", json.dumps(response))
    except Exception as airtrak_error:
        LOGGER.exception("AirtrakShipmentApiError: %s",
                         json.dumps(airtrak_error))

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
