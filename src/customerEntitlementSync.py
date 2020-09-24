import json
import boto3
import os
import csv
import codecs
import sys
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

InternalErrorMessage = "Internal Error."

def handler(event, context):

    try:
        logger.info("Event: {}".format(json.dumps(event)))

        table_name = os.environ['table']
        key = "Data/DB_api_cust_housebill_data000"

        s3 = boto3.resource('s3')

        if event['Records'][0]['s3']['object']['key'] == key:
            csv_obj = s3.Object(os.environ['bucket'], key).get()['Body']
            batch_size = 100
            batch = []
            fieldnames = ['FileNumber','HouseBillNumber','CustomerID']
            for row in csv.DictReader(codecs.getreader('utf-8')(csv_obj), fieldnames=fieldnames,delimiter='|'):
                if len(batch) >= batch_size:
                    write_to_dynamo(batch,table_name)
                    batch.clear()

                batch.append(row)

            if batch:
                write_to_dynamo(batch,table_name)

            logger.info("Sucessfully added records to omni-dw-customer-entitlement dynamo table")

        else:
            logger.info("No Action Required")
            
    
    except Exception as e:
        logging.exception("HandlerError: {}".format(e))
        raise HandlerError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))


def write_to_dynamo(rows,table_name):
    try:
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(table_name)
        with table.batch_writer() as batch:
            for i in range(len(rows)):
                batch.put_item(
                    Item=rows[i]
                )
    except Exception as e:
        logging.exception("WriteToDynamoError: {}".format(e))
        raise WriteToDynamoError(json.dumps({"httpStatus": 501, "message": InternalErrorMessage}))

class HandlerError(Exception): pass
class WriteToDynamoError(Exception): pass 