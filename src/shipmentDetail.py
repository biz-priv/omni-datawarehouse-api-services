import os
import json
import logging
import psycopg2

logger = logging.getLogger()
logger.setLevel(logging.INFO)

from src.common import dynamo_query
from src.common import modify_response
from src.common import modify_date
from src.common import process_input

InternalErrorMessage = "Internal Error."

def handler(event, context):
    logger.info("Event: {}".format(json.dumps(event)))
    
    details = process_input(event['query'])
    logger.info("Results from processing inputs: {}".format(details))
    if not details[2]['Items'] or details[2]['Items'][0]['RecordStatus']['S'] == "False":
        return get_shipment_detail(details[0],details[1])
    else:
        return {'shipmentDetails': modify_response(details[2]['Items'])}

def get_shipment_detail(hwb_file_nbr,parameter):
    try:        
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
                            port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        records_list = []
        cur.execute('select api_shipment_info.file_nbr ,api_shipment_info.file_date ,api_shipment_info.handling_stn ,api_shipment_info.master_bill_nbr ,api_shipment_info.house_bill_nbr, api_shipment_info.origin_port_iata ,api_shipment_info.destination_port_iata ,api_shipment_info.shipper_name ,api_shipment_info.consignee_name ,api_shipment_info.pieces ,api_shipment_info.actual_wght_lbs ,api_shipment_info.actual_wght_kgs ,api_shipment_info.chrg_wght_lbs ,api_shipment_info.chrg_wght_kgs ,api_shipment_info.pickup_date ,api_shipment_info.pod_date ,api_shipment_info.eta_date ,api_shipment_info.etd_date ,api_shipment_info.schd_delv_date , api_shipment_info.service_level, api_shipment_info.service_level_id,api_shipment_info.order_status ,api_shipment_info.order_status_Desc,api_shipment_info.bill_to_customer, api_shipment_info.cntrl_customer from api_shipment_info where'+parameter+f'{hwb_file_nbr}')
        con.commit()
    except Exception as e:
        logging.exception("GetShipmentDetailError: {}".format(e))
        raise GetShipmentDetailError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))
    for results in cur.fetchall():
        logger.info("Results before conversion: {}".format(results))
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
        record["Current Status"] = data[21]
        record["Current Status Desc"] = data[22]
        record["Bill To Customer"] = data[23]
        record["Control Customer"] = data[24]
        return record    
    except Exception as e:
        logging.exception("RecordsConversionError: {}".format(e))
        raise RecordsConversionError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

class GetShipmentDetailError(Exception): pass
class RecordsConversionError(Exception): pass