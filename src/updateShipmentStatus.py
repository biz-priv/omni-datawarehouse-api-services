import os
import json
import boto3
import psycopg2
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

from src.common import dynamo_query

def handler(event, context):
    logger.info("Event: {}".format(json.dumps(event)))
    
    response = dynamo_query(os.environ['SHIPMENT_DETAILS_TABLE'], os.environ['SHIPMENT_DETAILS_RECORDSTATUS_INDEX'], 
                    'RecordStatus = :record_status', {":record_status": {"S": 'True'}})
    
    if "Items" not in response or len(response["Items"]) == 0:
        logger.info("Dynamo query response: {}".format(response))
        return "No items with record_status = 'True'"

    try :
        house_bill_nbr_list = [i['HouseBillNumber']['S'] for i in response["Items"] if 'HouseBillNumber' in i]
        logger.info("House bill numbers with status True: {}".format(house_bill_nbr_list))
        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
                            port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        sql = "SELECT house_bill_nbr FROM public.api_shipment_info where house_bill_nbr IN ({})".format(','.join(['%s'] * len(house_bill_nbr_list)))
        cur.execute(sql, house_bill_nbr_list)
        con.commit()
        result = [item[0] for item in cur.fetchall()]
        logger.info("House bill numbers in warehouse: {}".format(result))
        cur.close()
        con.close()
    except Exception as e:
        logging.exception("WarehouseQueryError: {}".format(e))
        raise WarehouseQueryError(json.dumps({"httpStatus": 501, "message": "Data warehouse query error."}))

    for house_bill_nbr in result:
        try:
            table_name=os.environ["SHIPMENT_DETAILS_TABLE"]
        except Exception as e:
            logging.exception("EnvironmentVariableError: {}".format(e))
            raise EnvironmentVariableError(json.dumps({"httpStatus": 501, "message": "SHIPMENT_DETAILS_TABLE environment variable not set."}))
        key={"HouseBillNumber": {"S": house_bill_nbr}}
        expression="set #recStatus = :status"
        attribute_names={"#recStatus" : "RecordStatus"}
        attribute_values={":status": {"S": "False"}}
        
        dynamo_update(table_name, key, expression, attribute_names, attribute_values)
    
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
    except Exception as e:
        logging.exception("DynamoUpdateError: {}".format(e))
        raise DynamoUpdateError(json.dumps({"httpStatus": 501, "message": "Dynamo update query error."}))

class WarehouseQueryError(Exception): pass
class DynamoUpdateError(Exception): pass
class EnvironmentVariableError(Exception): pass