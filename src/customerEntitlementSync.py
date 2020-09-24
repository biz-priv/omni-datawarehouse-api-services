import json
import boto3
import os
import csv
import codecs
import sys

def handler(event, context):
    """Handler Function"""

    try:
        bucket = os.environ['bucket']
        tableName = os.environ['table']
        key = "Data/DB_api_cust_housebill_data000"
        s3 = boto3.resource('s3')
        if event['Records'][0]['s3']['object']['key'] == key:
            csv_obj = s3.Object(bucket, key).get()['Body']
            batch_size = 100
            batch = []
            fieldnames = ['FileNumber','HouseBillNumber','CustomerID']
            for row in csv.DictReader(codecs.getreader('utf-8')(csv_obj), fieldnames=fieldnames,delimiter='|'):
                if len(batch) >= batch_size:
                    write_to_dynamo(batch,tableName)
                    batch.clear()

                batch.append(row)

            if batch:
                write_to_dynamo(batch,tableName)

            print("Sucessfully added all the records into omni-dw-customer-entitlement-dev")
        else:
            print("No action required")
    except Exception as e:
        print("Error executing batch_writer : %s", e)


def write_to_dynamo(rows,tableName):
    """Write to DynamoDB"""
    try:
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(tableName)
        with table.batch_writer() as batch:
            for i in range(len(rows)):
                batch.put_item(
                    Item=rows[i]
                )
    except Exception as e:
        print("Error executing batch_writer : %s", e)