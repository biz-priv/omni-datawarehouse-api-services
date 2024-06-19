# """
# * File: v2\src\shipment_info.py
# * Project: Omni-datawarehouse-api-services
# * Author: Bizcloud Experts
# * Date: 2024-01-10
# * Confidential and Proprietary
# """
import os
import json
import logging
import psycopg2
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

from src.common import modify_response
from src.common import modify_date
from src.common import process_input
from src.common import skip_execution_if

INTERNAL_ERROR_MESSAGE = "Internal Error."

@skip_execution_if
def handler(event, context):
    LOGGER.info("Event: %s", json.dumps(event))
    customer_id_parameter = " and api_shipment_info.cust_id = "
    customer_id = event["enhancedAuthContext"]["customerId"]
    details = process_input(event['query'])
    if not details[2]['Items'] or details[2]['Items'][0]['RecordStatus']['S'] == "False":
        return get_shipment_info(details[0],details[1],customer_id_parameter,customer_id)
    return {'shipmentInfo': modify_response(details[2]['Items'])}

def get_shipment_info(hwb_file_nbr,parameter,customer_id_parameter,customer_id):
    try:
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
                            port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        LOGGER.info("Connection details: ", con)
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        records_list = []
        LOGGER.info('Query: select distinct api_shipment_info.file_nbr,api_shipment_info.file_date ,api_shipment_info.handling_stn,api_shipment_info.master_bill_nbr ,api_shipment_info.house_bill_nbr ,api_shipment_info.origin_port_iata ,api_shipment_info.destination_port_iata ,api_shipment_info.shipper_name ,api_shipment_info.consignee_name ,api_shipment_info.pod_date ,api_shipment_info.eta_date ,api_shipment_info.etd_date ,api_shipment_info.schd_delv_date ,api_shipment_info.service_level, api_shipment_info.service_level_id,api_shipment_info.shipment_mode ,api_shipment_info.order_status,api_shipment_info.order_status_desc,api_shipment_info.bill_to_customer from api_shipment_info where'+parameter+f'{hwb_file_nbr}'+customer_id_parameter+f'{customer_id}')
        cur.execute('select distinct api_shipment_info.file_nbr,api_shipment_info.file_date ,api_shipment_info.handling_stn,api_shipment_info.master_bill_nbr ,api_shipment_info.house_bill_nbr ,api_shipment_info.origin_port_iata ,api_shipment_info.destination_port_iata ,api_shipment_info.shipper_name ,api_shipment_info.consignee_name ,api_shipment_info.pod_date ,api_shipment_info.eta_date ,api_shipment_info.etd_date ,api_shipment_info.schd_delv_date ,api_shipment_info.service_level, api_shipment_info.service_level_id,api_shipment_info.shipment_mode ,api_shipment_info.order_status,api_shipment_info.order_status_desc,api_shipment_info.bill_to_customer from api_shipment_info where'+parameter+f'{hwb_file_nbr}'+customer_id_parameter+f'{customer_id}')
        con.commit()
    except Exception as get_error:
        logging.exception("GetShipmentInfoError: %s", get_error)
        raise GetShipmentInfoError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from get_error
    for results in cur.fetchall():
        LOGGER.info("Results before conversion: %s", results)
        records_list.append(convert_records(results))
    cur.close()
    con.close()
    return {'shipmentInfo': records_list}

def convert_records(data):
    try:
        record = {}
        record["File Number"] = data[0]
        record["File Date"] = modify_date(data[1])
        record["Handling Station"] = data[2]
        record["Master Waybill"] = data[3]
        record["House Waybill"] = data[4]
        record["Origin Port"] = data[5]
        record["Destination Port"] = data[6]
        record["Shipper Name"] = data[7]
        record["Consignee Name"] = data[8]
        record["Pod Date"] = modify_date(data[9])
        record["ETA Date"] = modify_date(data[10])
        record["ETD Date"] = modify_date(data[11])
        record["Scheduled Delivery Date"] = modify_date(data[12])
        record["Service Level Description"] = data[13]
        record["Service Level Code"] = data[14]
        record["Mode"] = data[15]
        record["Current Status"] = data[16]
        record["Current Status Desc"] = data[17]
        record["Bill To Customer"] = data[18]
        return record
    except Exception as conversion_error:
        logging.exception("RecordsConversionError: %s", json.dumps(conversion_error))
        raise RecordsConversionError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from conversion_error

class RecordsConversionError(Exception):
    pass
class GetShipmentInfoError(Exception):
    pass
class InputError(Exception):
    pass
