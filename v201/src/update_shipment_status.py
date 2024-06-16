# """
# * File: v201\src\update_shipment_status.py
# * Project: Omni-datawarehouse-api-services
# * Author: Bizcloud Experts
# * Date: 2023-06-28
# * Confidential and Proprietary
# """
import os
import json
import boto3
import psycopg2
import logging

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

from src.common import dynamo_query

def handler(event, context):
    LOGGER.info("Event: %s", json.dumps(event))
    response = dynamo_query(os.environ['SHIPMENT_DETAILS_TABLE'], os.environ['SHIPMENT_DETAILS_RECORDSTATUS_INDEX'],
                    'RecordStatus = :record_status', {":record_status": {"S": 'True'}})
    
    LOGGER.info("DyanmoDB response: %s", response)

    if "Items" not in response or len(response["Items"]) == 0:
        LOGGER.info("Dynamo query response: %s", json.dumps(response))
        return "No items with record_status = 'True'"

    try :
        house_bill_nbr_list = [i['HouseBillNumber']['S'] for i in response["Items"] if 'HouseBillNumber' in i]
        LOGGER.info("House bill numbers with status True: %s", json.dumps(house_bill_nbr_list))
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
                            port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        sql = "SELECT house_bill_nbr FROM public.api_shipment_info where house_bill_nbr IN ({})".format(','.join(['%s'] * len(house_bill_nbr_list)))
        cur.execute(sql, house_bill_nbr_list)
        con.commit()
        result = [item[0] for item in cur.fetchall()]
        LOGGER.info("House bill numbers in warehouse: %s", json.dumps(result))
        cur.close()
        con.close()
    except Exception as sql_error:
        logging.exception("WarehouseQueryError: %s", json.dumps(sql_error))
        raise WarehouseQueryError(json.dumps({"httpStatus": 501, "message": "Data warehouse query error."})) from sql_error

    for house_bill_nbr in result:
        try:
            table_name=os.environ["SHIPMENT_DETAILS_TABLE"]
        except Exception as env_error:
            logging.exception("EnvironmentVariableError: %s", json.dumps(env_error))
            raise EnvironmentVariableError(json.dumps({"httpStatus": 501, "message": "SHIPMENT_DETAILS_TABLE environment variable not set."})) from env_error
        key={"HouseBillNumber": {"S": house_bill_nbr}}
        expression="set #recStatus = :status"
        attribute_names={"#recStatus" : "RecordStatus"}
        attribute_values={":status": {"S": "False"}}
        dynamo_update(table_name, key, expression, attribute_names, attribute_values)
    LOGGER.info("Response: %s", json.dumps({"httpStatus": 200, "message": "Records updated successfully."}))
    return {"httpStatus": 200, "message": "Records updated successfully."}

def dynamo_update(table_name, key, expression, attribute_names, attribute_values, return_values="UPDATED_NEW"):
    try:
        client = boto3.client('dynamodb')
        return client.update_item(
            TableName=table_name,
            Key=key,
            UpdateExpression=expression,
            ExpressionAttributeNames=attribute_names,
            ExpressionAttributeValues=attribute_values,
            ReturnValues=return_values
        )
    except Exception as update_error:
        logging.exception("DynamoUpdateError: %s", json.dumps(update_error))
        raise DynamoUpdateError(json.dumps({"httpStatus": 501, "message": "Dynamo update query error."})) from update_error

class WarehouseQueryError(Exception):
    pass
class DynamoUpdateError(Exception):
    pass
class EnvironmentVariableError(Exception):
    pass
