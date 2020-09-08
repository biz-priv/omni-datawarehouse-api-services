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

def shipmentInfo(event):
    try:
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
        port= '5439', user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        x = event.get("query")['house_bill_nbr']
        logger.info("Value of x: {}".format(x))
        records_list = []
        
        cur.execute(f"select shipment_info.file_nbr ,shipment_info.file_date ,shipment_info.handling_stn,shipment_info.master_bill_nbr ,shipment_info.house_bill_nbr , shipment_info.origin_port_iata ,shipment_info.destination_port_iata ,shipment_info.shipper_name ,shipment_info.consignee_name ,shipment_info.pod_date ,shipment_info.eta_date ,shipment_info.etd_date , shipment_info.schd_delv_date ,shipment_info.shipment_mode ,shipment_info.current_status ,customers.name from shipment_info left outer join customers on shipment_info.source_system = customers.source_system and trim(shipment_info.bill_to_nbr) = trim(customers.nbr) where house_bill_nbr = '{x}'")
        con.commit()
        for results in cur.fetchall():
            temp = recordsConv(results)
            records_list.append(temp)

        cur.close()
        con.close()

        shipment_records = {'shipmentInfo':records_list}
        # print(shipment_records)
        y = json.dumps(shipment_records)
        payload = json.loads(y)
        return payload
    except error as e:
        raise error({"Error": True,"message":str(e)})

def recordsConv(y):
    try:
        record = {}
        record["File Number"] = y[0]
        record["File Date"] = dateconv(y[1])
        record["Handling Station"] = y[2]
        record["Master Waybill"] = y[3]
        record["House Waybill"] = y[4]
        record["Origin Port"] = y[5]
        record["Destination Port"] = y[6]
        record["Shipper Name"] = y[7]
        record["Consignee Name"] = y[8]
        record["Pod Date"] = dateconv(y[9])
        record["ETA Date"] = dateconv(y[10])
        record["ETD Date"] = dateconv(y[11])
        record["Scheduled Delivery Date"] = dateconv(y[12])
        record["Mode"] = y[13]
        record["Current Status Desc"] = y[14]
        record["Bill To Customer"] = y[15]
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
            return shipmentInfo(event)
        else:
            return response['Items']
    except error as e:
        raise error({"Error": True,"message":str(e)})