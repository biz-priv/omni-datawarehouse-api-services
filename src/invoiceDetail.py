import psycopg2
import logging
import json
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

from src.common import modify_date

InternalErrorMessage = "Internal Error."

def handler(event, context):
    logger.info("Event: {}".format(json.dumps(event)))
    try :
        if "house_bill_nbr" in event['query']:
            number = event['query']['house_bill_nbr']
            parameter = " shipment_info.house_bill_nbr = "
        else:
            number = event['query']['file_nbr']
            parameter = " shipment_info.file_nbr = "
        execution_parameters = [number, parameter]
        return execution_parameters
                
    try :    
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
                            port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
     
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()

        records_list = []

        cur.execute('SELECT count(*) FROM public.shipment_info where'+execution_parameters[1]+f'{execution_parameters[0]}')
        con.commit()
        result = cur.fetchone()
        record_count = result[0]
    except Exception as e:
        logging.exception("HandlerError: {}".format(e))
        raise HandlerError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))
        
        # record count for house_bill_nbr/file_number is >= 1 i,e. Atleast 1 HouseBill/FileNumber exists

    if record_count >= 1:
        try:
            cur.execute('select ar_invoice_receivables.file_nbr,shipment_info.house_bill_nbr, ar_invoice_receivables.revenue_stn,ar_invoice_receivables.invoice_nbr,ar_invoice_receivables.invoice_seq_nbr,customersb.name, customersc.name, ar_invoice_receivables.charge_cd_desc, ar_invoice_receivables.invoice_date, ar_invoice_receivables.due_date, ar_invoice_receivables.total from shipment_info join ar_invoice_receivables on shipment_info.source_system = ar_invoice_receivables.source_system  and shipment_info.file_nbr = ar_invoice_receivables.file_nbr left outer join public.customers customersb  on ar_invoice_receivables.source_system = customersb.source_system and trim(ar_invoice_receivables.bill_to_nbr) = trim(customersb.nbr) left outer join public.customers customersc on ar_invoice_receivables.source_system = customersc.source_system and trim(ar_invoice_receivables.bill_to_nbr) = trim(customersc.nbr) where'+execution_parameters[1]+f'{execution_parameters[0]}')
            con.commit()
            shipment_details = cur.fetchall()
        except Exception as e:
            logging.exception("QueryError: {}".format(e))
            raise QueryError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))
        if not shipment_details or len(shipment_details) == 0:
            logger.info("There are not customer charges for: {}".format(house_bill_nbr))
            raise NoChargesFound(json.dumps({"httpStatus": 202, "message": "There are no customer charges for: "+house_bill_nbr}))
        invoices = convert_records(shipment_details[0], get_charge_code(shipment_details))
        records_list.append(invoices)
        invoice_records = {'invoiceDetails': records_list}
        logger.info("invoice details : {}".format(invoice_records))
        return invoice_records
    else:
        logger.info("The provided house_bill_nbr does not exists")
        return "The provided house_bill_nbr does not exists"

def convert_records(shipment_charges,charge_desc):
    try:
        record = {}
        record["File Number"] = shipment_charges[0]
        record["House Bill Number"] = shipment_charges[1]
        record["Handling Station"] = shipment_charges[2]
        record["Invoice Number"] = shipment_charges[3]
        record["Invoice Seq Number"] = shipment_charges[4]
        record["Bill To Customer"] = shipment_charges[5]
        record["Controlling Customer"] = shipment_charges[6]
        record["Invoice Date"] = modify_date(shipment_charges[8])
        record["Due Date"] = modify_date(shipment_charges[9])
        record["Charges"] = charge_desc
        return record
    except Exception as e:
        logging.exception("RecordsConversionError: {}".format(e))
        raise RecordsConversionError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

def get_charge_code(shipment_details):
    try: 
        charges_list =[]
        for charges in shipment_details:
            response = {}
            response["Charge Code Desc"] = charges[7]
            response["Total"] = charges[10]
            charges_list.append(response)
        return charges_list 
    
    except Exception as e:
        logging.exception("ChargeCodeError: {}".format(e))
        raise ChargeCodeError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

class HandlerError(Exception): pass
class RecordsConversionError(Exception): pass
class ChargeCodeError(Exception): pass 
class QueryError(Exception): pass 
class NoChargesFound(Exception): pass