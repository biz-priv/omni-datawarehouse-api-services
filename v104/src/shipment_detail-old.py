# """
# * File: v104\src\shipment_detail-old.py
# * Project: Omni-datawarehouse-api-services
# * Author: Bizcloud Experts
# * Date: 2022-12-10
# * Confidential and Proprietary
# """
from src.common import modify_response
from src.common import modify_date
from src.common import modify_float
from src.common import process_input
import os
import json
import logging
import psycopg2
LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)
INTERNAL_ERROR_MESSAGE = "Internal Error."


def handler(event, context):
    LOGGER.info("Event: %s", json.dumps(event))
    customer_id_parameter = " and api_shipment_info.cust_id = "
    customer_id = event["enhancedAuthContext"]["customerId"]

    # check whether housebill or file nbr exists in shipment details dynamodb table
    details = process_input(event['query'])
    LOGGER.info("details: %s", details)

    # response from shipment details dynamodb table
    if (not details[2]['Items'] or len(details[2]["Items"]) == 0 or details[2]['Items'][0]['RecordStatus']['S'] == "False") and ('milestone_history' in event['query'] and event['query']['milestone_history'] in ["True", "t", "true", "T", "1"]):
        return get_shipment_detail_history(details[0], details[1], customer_id)
    if (not details[2]['Items'] or len(details[2]["Items"]) == 0 or details[2]['Items'][0]['RecordStatus']['S'] == "False") and ('milestone_history' not in event['query'] or event['query']['milestone_history'] in ["False", "f", "false", "F", "0"]):
        return get_shipment_detail(details[0], details[1], customer_id_parameter, customer_id)
    return {'shipmentDetails': modify_response(details[2]['Items'])}

# function to get all the history of milestone related shipment details


def get_shipment_detail_history(hwb_file_nbr, parameter, customer_id):
    try:
        con = psycopg2.connect(dbname=os.environ['db_name'], host=os.environ['db_host'],
                               port=os.environ['db_port'], user=os.environ['db_username'], password=os.environ['db_password'])

        # psycopg2 extension to enable AUTOCOMMIT
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        cur = con.cursor()
        records_list = []
        query = '''select distinct
                shipment_info.file_nbr ,shipment_info.file_datetime ,
                shipment_info.handling_stn ,shipment_info.master_bill_nbr ,
                shipment_info.house_bill_nbr, shipment_info.origin_port_iata ,shipment_info.destination_port_iata ,
                shipment_info.shipper_name ,
                shipment_info.shipper_addr_1 ,
                shipment_info.shipper_addr_2 ,
                shipment_info.shipper_city ,
                shipment_info.shipper_st ,
                shipment_info.shipper_cntry ,
                shipment_info.shipper_zip ,
                shipment_info.consignee_name ,
                shipment_info.consignee_addr_1 ,
                shipment_info.consignee_addr_2 ,
                shipment_info.consignee_city ,
                shipment_info.consignee_st ,
                shipment_info.consignee_cntry ,
                shipment_info.consignee_zip ,
                shipment_info.pieces ,
                shipment_info.actual_wght_lbs ,
                shipment_info.actual_wght_kgs ,shipment_info.chrg_wght_lbs ,
                shipment_info.chrg_wght_kgs ,
                shipment_info.pickup_date ,
                shipment_info.pickup_timezone ,
                shipment_info.pod_date ,
                shipment_info.pod_timezone,
                shipment_info.eta_date ,
                shipment_info.eta_timezone,
                shipment_info.etd_date ,
                shipment_info.etd_timezone,
                shipment_info.schd_delv_date ,
                shipment_info.schd_delv_timezone,
                shipment_info.service_level,
                service_level.service_level_id,
                shipment_milestone.order_status ,
                shipment_milestone.order_status_Desc,
                shipment_milestone.is_public,
                shipment_milestone.event_date,
                shipment_milestone.event_date_utc,
                customersb.name bill_to_cust,
                customersc.name cntrl_cust
                from shipment_info LEFT OUTER JOIN api_token ON shipment_info.source_system = api_token.source_system
                AND
                (
                TRIM(shipment_info.bill_to_nbr) = TRIM(api_token.cust_nbr)
                or TRIM(shipment_info.shipper_nbr) = TRIM(api_token.cust_nbr)
                OR TRIM(shipment_info.cntrl_cust_nbr) = TRIM(api_token.cust_nbr)
                )
                left outer join customers customersb
                on shipment_info.source_system = customersb.source_system and trim(shipment_info.bill_to_nbr) = trim(customersb.nbr)
                left outer join customers customersc
                on shipment_info.source_system = customersc.source_system and trim(shipment_info.cntrl_cust_nbr) = trim(customersc.nbr)
                left outer join shipment_milestone
                on shipment_info.source_system = shipment_milestone.source_system and shipment_info.file_nbr = shipment_milestone.file_nbr and shipment_milestone.is_custompublic = 'Y'
                left outer join service_level on shipment_info.service_level = service_level.service_level_desc
                where shipment_quote IN ('S')
               and '''+parameter+f'{hwb_file_nbr}'+' and api_token.ID = '+f'{customer_id}'
                
        LOGGER.info("shipment details query: %s", query)
        cur.execute(query)
        con.commit()
        shipment_details = cur.fetchall()
        LOGGER.info("results before processing : %s", shipment_details)
    except Exception as get_error:
        logging.exception("GetShipmentDetailError: %s", get_error)
        raise GetShipmentDetailError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from get_error

    milestones = convert_records_history(
        shipment_details[0], get_milestones(shipment_details))
    records_list.append(milestones)
    shipment_details_records = {'shipmentDetails': records_list}
    cur.close()
    con.close()
    LOGGER.info("shipment details : %s", shipment_details_records)
    return shipment_details_records


def get_milestones(shipment_details):
    try:
        milestone_list = []
        for milestones in shipment_details:
            response = {}
            response["Current Status"] = milestones[26]
            response["Current Status Desc"] = milestones[27]
            response["Current Status Date"] = modify_date(milestones[29])
            response["Current Status Date UTC"] = modify_date(milestones[30])
            milestone_list.append(response)
        LOGGER.info("milestone list : %s", milestone_list)
        return milestone_list
    except Exception as milestones_error:
        logging.exception("MilestoneError: %s", milestones_error)
        raise MilestoneError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from milestones_error

def date_check(datetime, timezone):
    if datetime:
        if timezone != None:
            datetimezone = datetime + " " + timezone
        else:
            datetimezone = datetime
    else:
        datetimezone = datetime
    return datetimezone

def convert_records_history(data, milestones_details):
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
        record["Pieces"] = data[9]
        record["Actual Weight LBS"] = modify_float(data[10])
        record["Actual Weight KGS"] = modify_float(data[11])
        record["Chargeable Weight LBS"] = modify_float(data[12])
        record["Chargeable Weight KGS"] = modify_float(data[13])
        record["Pickup Date"] = date_check(modify_date(data[14]), data[15])
        record["Pod Date"] = date_check(modify_date(data[16]), data[17])
        record["ETA Date"] = date_check(modify_date(data[18]), data[19])
        record["ETD Date"] = date_check(modify_date(data[20]), data[21])
        record["Scheduled Delivery Date"] = date_check(modify_date(data[22]), data[23])
        record["Service Level Description"] = data[24]
        record["Service Level Code"] = data[25]
        record["Bill To Customer"] = data[31]
        record["Control Customer"] = data[32]
        record["Milestones"] = milestones_details
        return record
    except Exception as conversion_error:
        logging.exception("RecordsConversionError: %s", conversion_error)
        raise RecordsConversionError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from conversion_error
    
def get_shipment_detail(hwb_file_nbr,parameter,customer_id_parameter,customer_id):
    try:
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
                            port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        records_list = []
        query = '''select 
                api_shipment_info.file_nbr ,api_shipment_info.file_datetime  ,api_shipment_info.handling_stn ,api_shipment_info.master_bill_nbr ,
                api_shipment_info.house_bill_nbr, api_shipment_info.origin_port_iata ,api_shipment_info.destination_port_iata ,
                api_shipment_info.shipper_name ,api_shipment_info.consignee_name ,api_shipment_info.pieces ,
                api_shipment_info.actual_wght_lbs ,api_shipment_info.actual_wght_kgs ,api_shipment_info.chrg_wght_lbs ,
                api_shipment_info.chrg_wght_kgs ,
                api_shipment_info.pickup_date ,
                api_shipment_info.pickup_timezone ,
                api_shipment_info.pod_date ,
                api_shipment_info.pod_timezone,
                api_shipment_info.eta_date ,
                api_shipment_info.eta_timezone,
                api_shipment_info.etd_date ,
                api_shipment_info.etd_timezone,
                api_shipment_info.schd_delv_date , 
                api_shipment_info.schd_delv_timezone,
                api_shipment_info.service_level, 
                api_shipment_info.service_level_id,
                api_shipment_info.order_status ,
                api_shipment_info.order_status_Desc,
                api_shipment_info.is_public,
                api_shipment_info.event_date,
                api_shipment_info.event_date_utc,
                api_shipment_info.bill_to_customer, 
                api_shipment_info.cntrl_customer 
                from api_shipment_info 
                where'''+parameter+f'{hwb_file_nbr}'+customer_id_parameter+f'{customer_id}'
        LOGGER.info("shipment details query : " + query)
        cur.execute(query)
        con.commit()
    except Exception as get_error:
        logging.exception("GetShipmentDetailError: %s", get_error)
        raise GetShipmentDetailError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from get_error
    for results in cur.fetchall():
        LOGGER.info("results before processing : %s", results)
        records_list.append(convert_records(results))
    cur.close()
    con.close()
    return {'shipmentDetails': records_list}

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
        record["Pieces"] = data[9]
        record["Actual Weight LBS"] = modify_float(data[10])
        record["Actual Weight KGS"] = modify_float(data[11])
        record["Chargeable Weight LBS"] = modify_float(data[12])
        record["Chargeable Weight KGS"] = modify_float(data[13])
        record["Pickup Date"] = date_check(modify_date(data[14]), data[15])
        record["Pod Date"] = date_check(modify_date(data[16]), data[17])
        record["ETA Date"] = date_check(modify_date(data[18]), data[19])
        record["ETD Date"] = date_check(modify_date(data[20]), data[21])
        record["Scheduled Delivery Date"] = date_check(modify_date(data[22]), data[23])
        record["Service Level Description"] = data[24]
        record["Service Level Code"] = data[25]
        record["Current Status"] = data[26]
        record["Current Status Desc"] = data[27]
        record["Is Public"] = data[28]
        record["Current Status Date"] = modify_date(data[29])
        record["Current Status Date UTC"] = modify_date(data[30])
        record["Bill To Customer"] = data[31]
        record["Control Customer"] = data[32]
        return record
    except Exception as conversion_error:
        logging.exception("RecordsConversionError: %s", json.dumps(conversion_error))
        raise RecordsConversionError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from conversion_error

class GetShipmentDetailError(Exception):
    pass
class RecordsConversionError(Exception):
    pass

class GetShipmentDetailError(Exception):
    pass


class RecordsConversionError(Exception):
    pass


class MilestoneError(Exception):
    pass
