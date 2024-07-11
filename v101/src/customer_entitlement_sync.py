# """
# * File: v101\src\customer_entitlement_sync.py
# * Project: Omni-datawarehouse-api-services
# * Author: Bizcloud Experts
# * Date: 2022-08-23
# * Confidential and Proprietary
# """
import json
import boto3
import os
import csv
import codecs
import logging

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

INTERNAL_ERROR_MESSAGE = "Internal Error."


def handler(event, context):
    try:
        LOGGER.info("Event: %s", json.dumps(event))
        table_name = os.environ['tableName']
        key = os.environ['s3_key']
        s3_client = boto3.resource('s3')
        if event['Records'][0]['s3']['object']['key'] == key:
            LOGGER.info("key matches")
            csv_obj = s3_client.Object(os.environ['bucket'], key).get()['Body']
            batch_size = 100
            batch = []
            fieldnames = ['FileNumber', 'HouseBillNumber', 'CustomerID']
            for row in csv.DictReader(codecs.getreader('utf-8')(csv_obj), fieldnames=fieldnames, delimiter='|'):
                if len(batch) >= batch_size:
                    write_to_dynamo(batch, table_name)
                    batch.clear()
                batch.append(row)
            if batch:
                write_to_dynamo(batch, table_name)
            LOGGER.info(
                "Sucessfully added records to omni-dw-customer-entitlement dynamo table")
        else:
            LOGGER.info("No Action Required")
    except Exception as handler_error:
        logging.exception("HandlerError: %s", handler_error)
        raise HandlerError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from handler_error


def write_to_dynamo(rows, table_name):
    try:
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(table_name)
        with table.batch_writer() as batch:
            for i in range(len(rows)):
                batch.put_item(Item=rows[i])
    except Exception as dynamo_write_error:
        logging.exception("WriteToDynamoError: %s",
                          json.dumps(dynamo_write_error))
        raise WriteToDynamoError(json.dumps(
            {"httpStatus": 501, "message": INTERNAL_ERROR_MESSAGE})) from dynamo_write_error


class HandlerError(Exception):
    pass


class WriteToDynamoError(Exception):
    pass
