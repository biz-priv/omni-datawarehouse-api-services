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


def invoiceDetail(event):
    try:
        con=psycopg2.connect(dbname = os.environ['db_name'], host = os.environ['db_host'],
        port= '5439', user = os.environ['db_username'], password = os.environ['db_password'])
     
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()

        x = event.get("query")['house_bill_nbr']
        logger.info("Value of x: {}".format(x))
        records_list = []
        

        cur.execute(f"select ar_invoice_receivables.file_nbr,shipment_info.house_bill_nbr, ar_invoice_receivables.revenue_stn,ar_invoice_receivables.invoice_nbr,ar_invoice_receivables.invoice_seq_nbr,customersb.name, customersc.name, ar_invoice_receivables.charge_cd_desc, ar_invoice_receivables.invoice_date, ar_invoice_receivables.due_date, ar_invoice_receivables.total from shipment_info join ar_invoice_receivables on shipment_info.source_system = ar_invoice_receivables.source_system  and shipment_info.file_nbr = ar_invoice_receivables.file_nbr left outer join public.customers customersb  on ar_invoice_receivables.source_system = customersb.source_system and trim(ar_invoice_receivables.bill_to_nbr) = trim(customersb.nbr) left outer join public.customers customersc on ar_invoice_receivables.source_system = customersc.source_system and trim(ar_invoice_receivables.bill_to_nbr) = trim(customersc.nbr) where house_bill_nbr = '{x}'")
        con.commit()
        for results in cur.fetchall():
            temp = recordsConv(results)
            records_list.append(temp)
        cur.close()
        con.close()

        invoice_records = {'invoiceDetails':records_list}
        y = json.dumps(invoice_records)
        payload = json.loads(y)
        return payload
            
    except error as e:
        raise error({"Error": True,"message":str(e)})

def recordsConv(y):
    try:
        record = {}
        record["File Number"] = y[0]
        record["House Bill Number"] = y[1]
        record["Handling Station"] = y[2]
        record["Invoice Number"] = y[3]
        record["Invoice Seq Number"] = y[4]
        record["Bill To Customer"] = y[5]
        record["Controlling Customer"] = y[6]
        record["Charge Code Desc"] = y[7]
        record["Invoice Date"] = dateconv(y[8])
        record["Due Date"] = dateconv(y[9])
        record["Total"] = y[10] 
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


class error(Exception):
    def __init___(self, message):
        Exception.__init__(self, "error : {}".format(message))
        self.message = message
        #Python inbuilt error class to change the error into stack format


def handler(event, context):
    try:
        print(event)
        house_bill_nbr = event.get("query")['house_bill_nbr']
        print
        response = client.query(
            TableName = os.environ['SHIPMENT_DETAILS_TABLE'],
            IndexName = 'HouseBillKeyIndex',
            KeyConditionExpression='HouseBillNumber = :house_bill_nbr',
            ExpressionAttributeValues={":house_bill_nbr": {"S": house_bill_nbr}}
        )
        print ("Dynamo query response: ", response)
        if not response['Items'] or response['Items'][0]['Record Status']['S'] == "False":
            return invoiceDetail(event)
        else:
            return response['Items']
    except error as e:
        raise error({"Error": True,"message":str(e)})        