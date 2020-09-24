import os
import psycopg2
import logging
import json
import datetime
from datetime import datetime,timezone
import requests
from requests.auth import HTTPBasicAuth

logger = logging.getLogger()
logger.setLevel(logging.INFO)

from src.common import dynamo_query

InternalErrorMessage = "Internal Error."

def handler(event, context):
    logger.info("Event: {}".format(json.dumps(event)))
    try:
        house_bill_nbr = event['query']['house_bill_nbr']
    except Exception as e:
        logging.exception("InputError: {}".format(e))
        raise InputError(json.dumps({"httpStatus": 400, "message": "Query parameter 'house_bill_nbr' not passed."}))
    
    try:
        response = dynamo_query(os.environ['SHIPMENT_DETAILS_TABLE'], os.environ['SHIPMENT_DETAILS_TABLE_INDEX'], 
                        'HouseBillNumber = :house_bill_nbr', {":house_bill_nbr": {"S": house_bill_nbr}})

        if not response['Items'] or response['Items'][0]['Record Status']['S'] == "False":
            return get_shipment_info(house_bill_nbr)
        else:
            data = response['Items']
            return modify_response(data)
    except Exception as e:
        logging.exception("HandlerError: {}".format(e))
        raise HandlerError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def modify_response(data):
    try:
        response = {}
        response["Service Level"] = data[0]["ServiceLevel"]["S"]
        response["House Waybill"] = data[0]["HouseBillNumber"]["S"]
        response["File Number"] = data[0]["File Number"]["S"]
        response["Shipper Name"] = data[0]["ShipperName"]["S"]
        response["Consignee Name"] = data[0]["ConsigneeName"]["S"]
        response["Current Status"] = data[0]["Shipment Status"]["S"]
        return {'shipmentInfo': [response]} 
    except Exception as e:
        logging.exception("ModifyResponseError: {}".format(e))
        raise ModifyResponseError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))


def get_shipment_info(house_bill_nbr):
    try:
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
                            port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        records_list = []
        cur.execute(f"select distinct api_shipment_info.file_nbr ,api_shipment_info.file_date ,api_shipment_info.handling_stn,api_shipment_info.master_bill_nbr ,api_shipment_info.house_bill_nbr ,api_shipment_info.origin_port_iata ,api_shipment_info.destination_port_iata ,api_shipment_info.shipper_name ,api_shipment_info.consignee_name ,api_shipment_info.pod_date ,api_shipment_info.eta_date ,api_shipment_info.etd_date ,api_shipment_info.schd_delv_date ,api_shipment_info.shipment_mode ,api_shipment_info.order_status,api_shipment_info.order_status_desc,api_shipment_info.bill_to_customer from api_shipment_info where house_bill_nbr = '{house_bill_nbr}'")
        con.commit()
        for results in cur.fetchall():
            logger.info("Results before conversion: {}".format(results))
            records_list.append(convert_records(results))
        cur.close()
        con.close()
        return {'shipmentInfo': records_list}
    except Exception as e:
        logging.exception("GetShipmentInfoError: {}".format(e))
        raise GetShipmentInfoError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def convert_records(y):
    try:
        record = {}
        record["File Number"] = y[0]
        record["File Date"] = modify_date(y[1])
        record["Handling Station"] = y[2]
        record["Master Waybill"] = y[3]
        record["House Waybill"] = y[4]
        record["Origin Port"] = y[5]
        record["Destination Port"] = y[6]
        record["Shipper Name"] = y[7]
        record["Consignee Name"] = y[8]
        record["Pod Date"] = modify_date(y[9])
        record["ETA Date"] = modify_date(y[10])
        record["ETD Date"] = modify_date(y[11])
        record["Scheduled Delivery Date"] = modify_date(y[12])
        record["Mode"] = y[13]
        record["Current Status"] = y[14]
        record["Current Status Desc"] = y[15]
        record["Bill To Customer"] = y[16]
        return record
    except Exception as e:
        logging.exception("RecordsConversionError: {}".format(e))
        raise RecordsConversionError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def modify_date(x):
    try:
        if x == None:
            return 'null'
        else:
            return x.isoformat()
    except Exception as e:
        logging.exception("DateConversionError: {}".format(e))
        raise DateConversionError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

class ModifyResponseError(Exception): pass
class HandlerError(Exception): pass
class RecordsConversionError(Exception): pass
class DateConversionError(Exception): pass
class GetShipmentInfoError(Exception): pass
class InputError(Exception): pass