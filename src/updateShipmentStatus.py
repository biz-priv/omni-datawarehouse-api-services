import os
import json
import boto3
import psycopg2
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

from src.common import dynamo_query

def handler(event, context):
    try :
        logger.info("Event: {}".format(json.dumps(event)))
        response = dynamo_query(os.environ['SHIPMENT_DETAILS_TABLE'], os.environ['SHIPMENT_DETAILS_RECORDSTATUS_INDEX'], 
                        'RecordStatus = :record_status', {":record_status": {"S": 'True'}})
        
        data = response['Items']
        print("Data is :", data)
        house_bill_nbr_list = [i['HouseBillNumber']['S'] for i in data if 'HouseBillNumber' in i]
        print (house_bill_nbr_list)
        
        # house_bill_numbers = tuple(house_bill_nbr_list)
        # logger.info("House Bill Numbers are : {}".format(house_bill_numbers))

        con=psycopg2.connect(dbname = os.environ['db_name'], host=os.environ['db_host'],
        port= os.environ['db_port'], user = os.environ['db_username'], password = os.environ['db_password'])
        con.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT) #psycopg2 extension to enable AUTOCOMMIT
        cur = con.cursor()
        # format_strings = ','.join(['%s'] * len(house_bill_nbr_list))
        # sql = (f"SELECT house_bill_nbr FROM public.api_shipment_info where house_bill_nbr IN (%s)" % format_strings, tuple(house_bill_nbr_list))
        # print (sql)
        sql = f"SELECT house_bill_nbr FROM public.api_shipment_info where house_bill_nbr IN %s" % (tuple(house_bill_nbr_list))
        cur.execute(sql)
        con.commit()
        #fetch the results from the slect statement executed above
        result = cur.fetchall()
        cur.close()
        con.close()
        print ("result:",result)
        # warehouse_hb_no = [housebill for (housebill,) in result]
        # print("These are the hwb from the warehouse : ", warehouse_hb_no)
        
        for i in result:
            response = table.update_item(
                TableName = os.environ['SHIPMENT_DETAILS_TABLE'],
                Key={
                    'HouseBillNumber': i
                },
                UpdateExpression="set #colName = :r",
                ExpressionAttributeValues={
                    ':r':"False",
                },
                ExpressionAttributeNames={
                '#colName' : 'Record Status'
                    },
                ReturnValues="UPDATED_NEW"
            )
            print("this is the updated response : ", response)
    except error as e:
        raise error({"Error": True,"message":str(e)})

class error(Exception):
    def __init___(self, message):
        Exception.__init__(self, "error : {}".format(message))
        self.message = message
        #Python inbuilt error class to change the error into stack format