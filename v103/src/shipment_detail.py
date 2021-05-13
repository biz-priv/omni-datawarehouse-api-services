import os
import json
import logging
import psycopg2
import datetime
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

from src.common import modify_response
from src.common import modify_date
from src.common import process_input

INTERNAL_ERROR_MESSAGE = "Internal Error."

def handler(event, context):
    logger.info("Event: %s", json.dumps(event))
    customer_id_parameter = " and api_shipment_info.cust_id = "
    customer_id = event["enhancedAuthContext"]["customerId"]
    
    #check whether housebill or file nbr exists in shipment details dynamodb table
    details = process_input(event['query'])

    # response from shipment details dynamodb table
    if (not details[2]['Items'] or len(details[2]["Items"]) == 0 or details[2]['Items'][0]['RecordStatus']['S'] == "False") and (event['query']['milestone_history'] == 'True'):
        return get_shipment_detail_history(details[0],details[1],customer_id)
    if (not details[2]['Items'] or len(details[2]["Items"]) == 0 or details[2]['Items'][0]['RecordStatus']['S'] == "False") and (event['query']['milestone_history'] == 'False'):
        return get_shipment_detail(details[0],details[1],customer_id_parameter,customer_id)
    return {'shipmentDetails': modify_response(details[2]['Items'])}

# function to get only latest milestone related shipment details
def get_shipment_detail(hwb_file_nbr,parameter,customer_id_parameter,customer_id):
    try:
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
                            port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        records_list = []
        cur.execute('select api_shipment_info.file_nbr ,api_shipment_info.file_date ,api_shipment_info.handling_stn ,api_shipment_info.master_bill_nbr ,api_shipment_info.house_bill_nbr, api_shipment_info.origin_port_iata ,api_shipment_info.destination_port_iata ,api_shipment_info.shipper_name ,api_shipment_info.consignee_name ,api_shipment_info.pieces ,api_shipment_info.actual_wght_lbs ,api_shipment_info.actual_wght_kgs ,api_shipment_info.chrg_wght_lbs ,api_shipment_info.chrg_wght_kgs ,api_shipment_info.pickup_date ,api_shipment_info.pod_date ,api_shipment_info.eta_date ,api_shipment_info.etd_date ,api_shipment_info.schd_delv_date , api_shipment_info.service_level, api_shipment_info.service_level_id,api_shipment_info.order_status ,api_shipment_info.order_status_Desc,api_shipment_info.event_date,api_shipment_info.event_date_utc,api_shipment_info.bill_to_customer, api_shipment_info.cntrl_customer from api_shipment_info where'+parameter+f'{hwb_file_nbr}'+customer_id_parameter+f'{customer_id}')
        con.commit()
    except Exception as get_error:
        logging.exception("GetShipmentDetailError: %s", json.dumps(get_error))
        raise GetShipmentDetailError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from get_error
    for results in cur.fetchall():
        records_list.append(convert_records(results))
    cur.close()
    con.close()
    return {'shipmentDetails': records_list}

#function to get all the history of milestone related shipment details
def get_shipment_detail_history(hwb_file_nbr,parameter,customer_id):
    try:
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
                            port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        records_list = []
        cur.execute('''select distinct  shipment_info.source_system, shipment_info.file_nbr, shipment_info.file_date ,shipment_info.handling_stn ,shipment_info.master_bill_nbr , \
            shipment_info.house_bill_nbr,shipment_info.origin_port_iata ,shipment_info.destination_port_iata ,shipment_info.shipper_name ,shipment_info.consignee_name ,shipment_info.pieces ,\
            shipment_info.actual_wght_lbs ,shipment_info.actual_wght_kgs ,shipment_info.chrg_wght_lbs ,shipment_info.chrg_wght_kgs ,shipment_info.pickup_date ,shipment_info.pod_date ,shipment_info.eta_date ,shipment_info.etd_date ,shipment_info.schd_delv_date ,\
            shipment_info.service_level ,service_level.service_level_id, case when shipment_info.source_system = 'WT' then shipment_milestone.order_status else shipment_info.current_status end as order_status, \
            case when shipment_info.source_system = 'WT' then shipment_milestone.order_Status_Desc else shipment_info.current_status end as order_status_desc,\
            shipment_milestone.event_Date,shipment_milestone.event_Date_utc,customersb.name bill_to_customer,customersc.name controlling_customer \
            from shipment_info LEFT OUTER JOIN api_token ON shipment_info.source_system = api_token.source_system AND TRIM(shipment_info.bill_to_nbr) = TRIM(api_token.cust_nbr)\
            left outer join customers customersb on shipment_info.source_system = customersb.source_system and trim(shipment_info.bill_to_nbr) = trim(customersb.nbr) left outer join customers customersc \
            on shipment_info.source_system = customersc.source_system and trim(shipment_info.cntrl_cust_nbr) = trim(customersc.nbr) left outer join \
            shipment_milestone on shipment_info.source_system = shipment_milestone.source_system and shipment_info.file_nbr = shipment_milestone.file_nbr and shipment_milestone.is_custompublic = 'Y' \
            left outer join service_level on shipment_info.service_level = service_level.service_level_desc where shipment_quote IN ('S') AND current_status <> 'CAN' \
            and shipment_info.'''+parameter+f'{hwb_file_nbr}'+' and api_token.ID = '+f'{customer_id}')
        con.commit()
        shipment_details = cur.fetchall()
    except Exception as get_error:
        logging.exception("GetShipmentDetailError: %s", get_error)
        raise GetShipmentDetailError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from get_error
    milestones = convert_records_history(shipment_details[0], get_milestones(shipment_details))
    records_list.append(milestones)
    shipment_details_records = {'shipmentDetails': records_list}
    cur.close()
    con.close()
    logger.info("shipment details : %s", shipment_details_records)
    return shipment_details_records
    
def x12_ref(current_status_code):
    try:
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
            port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        cur = con.cursor()
        current_status = '\''+current_status_code+'\''
        cur.execute(f"select trim(x12_cd), trim(x12_event_desc) from public.x12_cross_ref where omni_cd = {current_status}")
        con.commit()
        x12_ref = cur.fetchall()
        cur.close()
        con.close()
        # logger.info("x12 details : %s", x12_ref)
        return x12_ref[0][0], x12_ref[0][1]
    except Exception as codes_error:
        logging.exception("GetX12CodesError: %s",codes_error)
        raise X12RefError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from codes_error

def get_milestones(shipment_details):
    try:
        milestone_list = []
        for milestones in shipment_details:
            response = {}
            response["Current Status"] ,response["Current Status Desc"] = x12_ref(milestones[22])
            response["Current Status Date"] = modify_date(milestones[24])
            response["Current Status Date UTC"] = modify_date(milestones[25])
            milestone_list.append(response)
        # logger.info("milestone list is : %s", milestone_list)
        return milestone_list
    except Exception as milestones_error:
        logging.exception("MilestoneError: %s", milestones_error)
        raise MilestoneError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from milestones_error

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
        record["Actual Weight LBS"] = data[10]
        record["Actual Weight KGS"] = data[11]
        record["Chargeable Weight LBS"] = data[12]
        record["Chargeable Weight KGS"] = data[13]
        record["Pickup Date"] = modify_date(data[14])
        record["Pod Date"] = modify_date(data[15])
        record["ETA Date"] = modify_date(data[16])
        record["ETD Date"] = modify_date(data[17])
        record["Scheduled Delivery Date"] = modify_date(data[18])
        record["Service Level Description"] = data[19]
        record["Service Level Code"] = data[20]
        record["Current Status"],record["Current Status Desc"] = x12_ref(data[21])
        record["Current Status Date"] = modify_date(data[23])
        record["Current Status Date UTC"] = modify_date(data[24])
        record["Bill To Customer"] = data[25]
        record["Control Customer"] = data[26]
        return record
    except Exception as conversion_error:
        logging.exception("RecordsConversionError: %s", json.dumps(conversion_error))
        raise RecordsConversionError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from conversion_error

def convert_records_history(data,milestones_details):
    try:
        record = {}
        record["File Number"] = data[1]
        record["File Date"] = modify_date(data[2])
        record["Handling Station"] = data[3]
        record["Master Waybill"] = data[4]
        record["House Waybill"] = data[5]
        record["Origin Port"] = data[6]
        record["Destination Port"] = data[7]
        record["Shipper Name"] = data[8]
        record["Consignee Name"] = data[9]
        record["Pieces"] = data[10]
        record["Actual Weight LBS"] = float(data[11])
        record["Actual Weight KGS"] = float(data[12])
        record["Chargeable Weight LBS"] = float(data[13])
        record["Chargeable Weight KGS"] = float(data[14])
        record["Pickup Date"] = modify_date(data[15])
        record["Pod Date"] = modify_date(data[16])
        record["ETA Date"] = modify_date(data[17])
        record["ETD Date"] = modify_date(data[18])
        record["Scheduled Delivery Date"] = modify_date(data[19])
        record["Service Level Description"] = data[20]
        record["Service Level Code"] = data[21]
        record["Bill To Customer"] = data[26]
        record["Control Customer"] = data[27]
        record["Milestones"] = milestones_details
        return record
    except Exception as conversion_error:
        logging.exception("RecordsConversionError: %s", conversion_error)
        raise RecordsConversionError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from conversion_error

class GetShipmentDetailError(Exception):
    pass
class RecordsConversionError(Exception):
    pass
class MilestoneError(Exception):
    pass
class X12RefError(Exception):
    pass

