import psycopg2
import logging
import json
import datetime
from datetime import datetime,timezone
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
    try:
        print(event)
        house_bill_nbr = event.get("query")['house_bill_nbr']
        response = client.query(
            TableName = os.environ['SHIPMENT_DETAILS_TABLE'],
            IndexName = os.environ['SHIPMENT_DETAILS_TABLE_INDEX'],
            KeyConditionExpression='HouseBillNumber = :house_bill_nbr',
            ExpressionAttributeValues={":house_bill_nbr": {"S": house_bill_nbr}}
        )
        print ("Dynamo query response: ", response)
        if not response['Items'] or response['Items'][0]['Record Status']['S'] == "False":
            return shipmentInfo(event)
        else:
            tempDynamoData = response['Items']
            shipmentDetails = dynamoResponse(tempDynamoData)
            return shipmentDetails
    except error as e:
        raise error({"Error": True,"message":str(e)})

def dynamoResponse(tempDynamoData):
    dynamoDetails = []
    dynamo_response = {}
    dynamo_response["Service Level"] = tempDynamoData[0]["ServiceLevel"]["S"]
    dynamo_response["House Waybill"] = tempDynamoData[0]["HouseBillNumber"]["S"]
    dynamo_response["File Number"] = tempDynamoData[0]["File Number"]["S"]
    dynamo_response["Shipper Name"] = tempDynamoData[0]["ShipperName"]["S"]
    dynamo_response["Consignee Name"] = tempDynamoData[0]["ConsigneeName"]["S"]
    dynamo_response["Current Status"] = tempDynamoData[0]["Shipment Status"]["S"]
    dynamoDetails.append(dynamo_response)
    dynamo_records = {'shipmentInfo':dynamoDetails}
    return dynamo_records


def shipmentInfo(event):
    try:
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
        port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        x = event.get("query")['house_bill_nbr']
        logger.info("Value of x: {}".format(x))
        records_list = []
        cur.execute(f"select distinct api_shipment_info.file_nbr ,api_shipment_info.file_date ,api_shipment_info.handling_stn,api_shipment_info.master_bill_nbr ,api_shipment_info.house_bill_nbr ,api_shipment_info.origin_port_iata ,api_shipment_info.destination_port_iata ,api_shipment_info.shipper_name ,api_shipment_info.consignee_name ,api_shipment_info.pod_date ,api_shipment_info.eta_date ,api_shipment_info.etd_date ,api_shipment_info.schd_delv_date ,api_shipment_info.shipment_mode ,api_shipment_info.order_status,api_shipment_info.order_status_desc,api_shipment_info.bill_to_customer from api_shipment_info where house_bill_nbr = '{x}'")
        con.commit()
        for results in cur.fetchall():
            print("Results before conversion :", results)
            temp = recordsConv(results)
            records_list.append(temp)
        cur.close()
        con.close()
        shipment_records = {'shipmentInfo':records_list}
        return shipment_records
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
        record["Current Status"] = y[14]
        record["Current Status Desc"] = y[15]
        record["Bill To Customer"] = y[16]
        return record
    except error as e:
        raise error({"Error": True,"message":str(e)})

def dateconv(x):
    try:
        if x == None:
            x = 'null'
            return x
        else:
            return x.isoformat()
    except error as e:
        raise error({"Error": True,"message":str(e)})

class error(Exception):
    def __init___(self, message):
        Exception.__init__(self, "error : {}".format(message))
        self.message = message
        #Python inbuilt error class to change the error into stack format