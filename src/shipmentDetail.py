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
        print
        response = client.query(
            TableName = os.environ['SHIPMENT_DETAILS_TABLE'],
            IndexName = os.environ['SHIPMENT_DETAILS_TABLE_INDEX'],
            KeyConditionExpression='HouseBillNumber = :house_bill_nbr',
            ExpressionAttributeValues={":house_bill_nbr": {"S": house_bill_nbr}}
        )
        print ("Dynamo query response: ", response)
        if not response['Items'] or response['Items'][0]['Record Status']['S'] == "False":
            return shipmentDetail(event)
        else:
            tempDynamoData = response['Items']
            shipmentData = dynamoResponse(tempDynamoData)
            print("This is the response from Dynamodb temp : ", shipmentData)
            return shipmentData
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
    dynamo_records = {'shipmentDetails':dynamoDetails}
    return dynamo_records


def shipmentDetail(event):
    try:        
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
        port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        x = event.get("query")['house_bill_nbr']
        logger.info("Value of x: {}".format(x))
        records_list = []
        cur.execute(f"select api_shipment_info.file_nbr ,api_shipment_info.file_date ,api_shipment_info.handling_stn ,api_shipment_info.master_bill_nbr ,api_shipment_info.house_bill_nbr, api_shipment_info.origin_port_iata ,api_shipment_info.destination_port_iata ,api_shipment_info.shipper_name ,api_shipment_info.consignee_name ,api_shipment_info.pieces ,api_shipment_info.actual_wght_lbs ,api_shipment_info.actual_wght_kgs ,api_shipment_info.chrg_wght_lbs ,api_shipment_info.chrg_wght_kgs ,api_shipment_info.pickup_date ,api_shipment_info.pod_date ,api_shipment_info.eta_date ,api_shipment_info.etd_date ,api_shipment_info.schd_delv_date , api_shipment_info.service_level ,api_shipment_info.order_status ,api_shipment_info.order_status_Desc,api_shipment_info.bill_to_customer, api_shipment_info.cntrl_customer from api_shipment_info where house_bill_nbr = '{x}'")
        con.commit()
        for results in cur.fetchall():
            temp = recordsConv(results)
            records_list.append(temp)
        cur.close()
        con.close()
        shipment_records = {'shipmentDetails':records_list}
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
        record["Pieces"] = y[9]
        record["Actual Weight LBS"] = y[10]
        record["Actual Weight KGS"] = y[11]
        record["Chargable Weight LBS"] = y[12]
        record["Chargable Weight KGS"] = y[13]
        record["Pickup Date"] = dateconv(y[14])
        record["Pod Date"] = dateconv(y[15])
        record["ETA Date"] = dateconv(y[16])
        record["ETD Date"] = dateconv(y[17])
        record["Scheduled Delivery Date"] = dateconv(y[18])
        record["Service Level"] = y[19]
        record["Current Status"] = y[20]
        record["Current Status Desc"] = y[21]
        record["Bill To Customer"] = y[22]
        record["Control Customer"] = y[23]
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