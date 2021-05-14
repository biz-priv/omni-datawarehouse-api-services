import psycopg2
import logging
import json
import os
logger = logging.getLogger()
logger.setLevel(logging.INFO)

from src.common import modify_date

INTERNAL_ERROR_MESSAGE = "Internal Error."

def handler(event, context):
    logger.info("Event: %s", json.dumps(event))
    customer_id_parameter = " and api_token.id = "
    customer_id = event["enhancedAuthContext"]["customerId"]
    try :
        if "house_bill_nbr" in event['query']:
            number = event['query']['house_bill_nbr']
            parameter = " shipment_info.house_bill_nbr = "
        else:
            number = event['query']['file_nbr']
            parameter = " shipment_info.file_nbr = "
        execution_parameters = [number, parameter]
    except Exception as input_error:
        logging.exception("ProcessingInputError: %s", json.dumps(input_error))
        raise ProcessingInputError(json.dumps({"httpStatus": 400, "message": "Input Validation Error"})) from input_error

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
    except Exception as handler_error:
        logging.exception("HandlerError: %s", json.dumps(handler_error))
        raise HandlerError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from handler_error

    if record_count >= 1:
        try:
            cur.execute('select ar_invoice_receivables.file_nbr,shipment_info.house_bill_nbr, ar_invoice_receivables.revenue_stn,ar_invoice_receivables.invoice_nbr,ar_invoice_receivables.invoice_seq_nbr,customersb.name, customersc.name, ar_invoice_receivables.charge_cd_desc, ar_invoice_receivables.invoice_date,ar_invoice_receivables.due_date, ar_invoice_receivables.total,api_token.id from shipment_info join ar_invoice_receivables on shipment_info.source_system = ar_invoice_receivables.source_system and shipment_info.file_nbr = ar_invoice_receivables.file_nbr left outer join api_token on ar_invoice_receivables.source_system = api_token.source_system and trim(ar_invoice_receivables.bill_to_nbr) = trim(api_token.cust_nbr) left outer join public.customers customersb  on ar_invoice_receivables.source_system = customersb.source_system and  trim(ar_invoice_receivables.bill_to_nbr) = trim(customersb.nbr) left outer join public.customers customersc on ar_invoice_receivables.source_system = customersc.source_system and trim(ar_invoice_receivables.bill_to_nbr) = trim(customersc.nbr) where'+execution_parameters[1]+f'{execution_parameters[0]}'+customer_id_parameter+f'{customer_id}')
            con.commit()
            shipment_details = cur.fetchall()
        except Exception as query_error:
            logging.exception("QueryError: %s", json.dumps(query_error))
            raise QueryError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from query_error
        if not shipment_details or len(shipment_details) == 0:
            logger.info("There are no customer charges for: %s", execution_parameters[0])
            raise NoChargesFound(json.dumps({"httpStatus": 202, "message": "There are no customer charges for: "+execution_parameters[0]}))
        invoices = convert_records(shipment_details[0], get_charge_code(shipment_details))
        records_list.append(invoices)
        invoice_records = {'invoiceDetails': records_list}
        logger.info("invoice details : %s", invoice_records)
        return invoice_records
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
    except Exception as convert_error:
        logging.exception("RecordsConversionError: %s", json.dumps(convert_error))
        raise RecordsConversionError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from convert_error

def get_charge_code(shipment_details):
    try:
        charges_list =[]
        for charges in shipment_details:
            response = {}
            response["Charge Code Desc"] = charges[7]
            response["Total"] = charges[10]
            charges_list.append(response)
        return charges_list
    except Exception as charges_error:
        logging.exception("ChargeCodeError: %s", json.dumps(charges_error))
        raise ChargeCodeError(json.dumps({"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from charges_error

class HandlerError(Exception):
    pass
class RecordsConversionError(Exception):
    pass
class ChargeCodeError(Exception):
    pass
class QueryError(Exception):
    pass
class NoChargesFound(Exception):
    pass
class ProcessingInputError(Exception):
    pass
