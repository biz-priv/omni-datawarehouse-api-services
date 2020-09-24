import psycopg2
import logging
import json
import datetime
import requests
import os
import boto3
from requests.auth import HTTPBasicAuth
logger = logging.getLogger()
logger.setLevel(logging.INFO)
import botocore.session
session = botocore.session.get_session()
client = session.create_client('dynamodb', region_name='us-east-1')


def handler(event, context):
    try :
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
        port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
     
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()

        x = event.get("query")['house_bill_nbr']
        logger.info("Value of x: {}".format(x))
        records_list = []
        invoice_records = {'updates':''}

    
        cur.execute(f"SELECT count(*) FROM public.shipment_info where house_bill_nbr = '{x}'")
        con.commit()
        #fetch the results from the slect statement executed above
        result = cur.fetchone()
        #store the result in a variable
        count = result[0]

        #if the count of the house bill number is >= 1, i,e. if atleast 1 HB# exists, execute the below script
        strg = "The provided house bill number does not exists"

        if count >= 1:
            cur.execute(f"select ar_invoice_receivables.file_nbr,shipment_info.house_bill_nbr, ar_invoice_receivables.revenue_stn,ar_invoice_receivables.invoice_nbr,ar_invoice_receivables.invoice_seq_nbr,customersb.name, customersc.name, ar_invoice_receivables.charge_cd_desc, ar_invoice_receivables.invoice_date, ar_invoice_receivables.due_date, ar_invoice_receivables.total from shipment_info join ar_invoice_receivables on shipment_info.source_system = ar_invoice_receivables.source_system  and shipment_info.file_nbr = ar_invoice_receivables.file_nbr left outer join public.customers customersb  on ar_invoice_receivables.source_system = customersb.source_system and trim(ar_invoice_receivables.bill_to_nbr) = trim(customersb.nbr) left outer join public.customers customersc on ar_invoice_receivables.source_system = customersc.source_system and trim(ar_invoice_receivables.bill_to_nbr) = trim(customersc.nbr) where house_bill_nbr = '{x}'")
            con.commit()
            data = cur.fetchall()
            charge_desc = charges(data)
            temp = recordsConv(data[0], charge_desc)
            records_list.append(temp)
            invoice_records = {'invoiceDetails':records_list}
            return(invoice_records)
            
        else:
            return(strg)

    except error as e:
        raise error({"Error": True,"message":str(e)})

def recordsConv(y, h):
    try:
        record = {}
        record["File Number"] = y[0]
        record["House Bill Number"] = y[1]
        record["Handling Station"] = y[2]
        record["Invoice Number"] = y[3]
        record["Invoice Seq Number"] = y[4]
        record["Bill To Customer"] = y[5]
        record["Controlling Customer"] = y[6]
        record["Invoice Date"] = dateconv(y[8])
        record["Due Date"] = dateconv(y[9])
        record["Charges"] = h
        return record

    except error as e:
        raise error({"Error": True,"message":str(e)})

def dateconv(x):
    try:
        if x == None:
            x = 'null'
            return x
        else:
            return x.strftime('%m/%d/%Y %H:%M:%S')
    except error as e:
        raise error({"Error": True,"message":str(e)})


def charges(y):
    charges_list =[]
    for g in y:
        res = {}
        res["Charge Code Desc"] = g[7]
        res["Total"] = g[10]
        charges_list.append(res)
    return charges_list 

class error(Exception):
    def __init___(self, message):
        Exception.__init__(self, "error : {}".format(message))
        self.message = message
        #Python inbuilt error class to change the error into stack format

