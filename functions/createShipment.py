import json
import os
import dicttoxml
import xmltodict
import requests
import requests
from requests.auth import HTTPBasicAuth
import logging
import boto3
client = boto3.client('dynamodb')
import xml.etree.ElementTree as ET
logger = logging.getLogger()
logger.setLevel(logging.INFO)
customer_table = os.environ['CUSTOMER_ENTITLEMENT_TABLE']
account_info_table = os.environ['ACCOUNT_INFO_TABLE']
shipment_details_table = os.environ['SHIPMENT_DETAILS_TABLE']

def handler(event, context):
    try:
        customerId = event['enhancedAuthContext']['customerId']
        data = event.get("body")
        customerInfo = validate_dynamoDB(customerId)
        print("Customer:",customerInfo)
        if customerInfo == 'Failure':
            return 'Customer Information doesnot exist. Please raise a support ticket to add the customer'
        else:
            print("customerInfo is :",customerInfo)
        data["oShipData"]["Station"] = customerInfo['Station']['S']
        data["oShipData"]["CustomerNo"] = customerInfo['CustomerNo']['S']
        data["oShipData"]["BillToAcct"] = customerInfo['BillToAcct']['S']
        tempOShipData = {}
        tempOShipData["AddNewShipmentV3"] = {}
        tempOShipData["AddNewShipmentV3"]["oShipData"] = {}
        for key in data["oShipData"]:
            if type(data["oShipData"][key]) is str:
                newKey = key.replace(" ", "")
                tempOShipData["AddNewShipmentV3"]["oShipData"][newKey] = data["oShipData"][key]
        tempShipmentLineList = removeSpaceInListObjectKeys(data["oShipData"]["Shipment Line List"])
        ShipmentLineList_Item = lambda x: 'NewShipmentDimLineV3'
        ShipmentLineList=dicttoxml.dicttoxml(tempShipmentLineList, attr_type=False,custom_root='ShipmentLineList',item_func=ShipmentLineList_Item)
        ShipmentLineList = str(ShipmentLineList).replace("""b'<?xml version="1.0" encoding="UTF-8" ?>""", """""").replace("""</ShipmentLineList>'""","""</ShipmentLineList>""")
        tempReferenceList = removeSpaceInListObjectKeys(data["oShipData"]["Reference List"])
        ReferenceList_Item = lambda x: 'NewShipmentRefsV3'
        ReferenceList=dicttoxml.dicttoxml(tempReferenceList, attr_type=False,custom_root='ReferenceList',item_func=ReferenceList_Item)
        ReferenceList = str(ReferenceList).replace("""b'<?xml version="1.0" encoding="UTF-8" ?>""", """""").replace("""</ReferenceList>'""","""</ReferenceList>""")
        tempAcessorialsList = removeSpaceInListObjectKeys(data["oShipData"]["New Shipment Acessorials List"])
        AcessorialList_Item = lambda x: 'NewShipmentAcessorialsV3'
        AcessorialList=dicttoxml.dicttoxml(tempAcessorialsList, attr_type=False,custom_root='NewShipmentAcessorialsList',item_func=AcessorialList_Item)
        AcessorialList = str(AcessorialList).replace("""b'<?xml version="1.0" encoding="UTF-8" ?>""", """""").replace("""</NewShipmentAcessorialsList>'""","""</NewShipmentAcessorialsList>""")
        ShipData=dicttoxml.dicttoxml(tempOShipData, attr_type=False,custom_root='soap:Body')
        ShipData = str(ShipData).replace("""b'<?xml version="1.0" encoding="UTF-8" ?><soap:Body><AddNewShipmentV3><oShipData>""", """""").replace("""</oShipData></AddNewShipmentV3></soap:Body>'""","""""")
        Start = """<?xml version="1.0" encoding="utf-8" ?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header><AuthHeader xmlns="http://tempuri.org/"><UserName>biztest</UserName><Password>Api081020</Password></AuthHeader></soap:Header><soap:Body><AddNewShipmentV3 xmlns="http://tempuri.org/"><oShipData>"""
        end = """</oShipData></AddNewShipmentV3></soap:Body></soap:Envelope>"""
        Payload = Start+ShipData+ShipmentLineList+ReferenceList+AcessorialList+end
        # print("Payload xml data is :",Payload)
        url = 'https://wttest.omnilogistics.com/WTKServices/AirtrakShipment.asmx'
        pars = {'op': 'AddNewShipmentV3'}
        r = requests.post(url, headers = {'Content-Type': 'text/xml; charset=utf-8'},data = Payload, params = pars)
        response = r.text
        print("response is :", response)
        ShipmentData = update_Response(response)
        update_authorizer_table(ShipmentData,customerId)
        HouseBillInfo = tempOShipData["AddNewShipmentV3"]["oShipData"]
        print("House Bill Details are:",HouseBillInfo)
        update_shipment_table(ShipmentData,HouseBillInfo)
        return ShipmentData
    except error as e:
        raise error({"Error": True,"message":str(e)})
def removeSpaceInListObjectKeys(array):
    try:
        newArray = []
        for obj in array:
            newObj = {}
            for key in obj:
                newKey = key.replace(" ","")
                newObj[newKey] = obj[key]
            newArray.append(newObj)
        return newArray
    except error as e:
        raise error({"Error": True,"message":str(e)})
def validate_dynamoDB(customerId):
    try:
        response = client.query(
            TableName=account_info_table,
            IndexName='CustomerIDIndex',
            Select='ALL_ATTRIBUTES',
            KeyConditionExpression='CustomerID = :CustomerID',
            ExpressionAttributeValues={":CustomerID": {"S": customerId}}
        )
        print("Response is:",response)
        if not response['Items']:
            return 'Failure'
        else:
            return response['Items'][0]
    except error as e:
        raise error({"Error": True,"message":str(e)})
def update_Response(response):
    try:
        shipmentDetails = []
        tempShipmentDetails = xmltodict.parse(response)
        tempShipmentDetails = json.dumps(tempShipmentDetails)
        tempShipmentDetails = json.loads(tempShipmentDetails)
        shipmentDetails = tempShipmentDetails["soap:Envelope"]["soap:Body"]["AddNewShipmentV3Response"]["AddNewShipmentV3Result"]
        tempdata = ['ErrorMessage','DestinationAirport']
        for i in tempdata:
            shipmentDetails.pop(i)
        print("Shipment Details are: ",shipmentDetails)
        return shipmentDetails
    except error as e:
        raise error({"Error": True,"message":str(e)})    
def update_authorizer_table(ShipmentData,customerId):
    try:
        x = ShipmentData['Housebill']
        print("DynamoX : ", x)
        response = client.put_item(
            TableName = customer_table,
            Item={
                'CustomerID': {
                'S': customerId
                },
                'HouseBillNumber':{
                'S': x
                }
            }
        )
        return response
    except error as e:
        raise error({"Error": True,"message":str(e)})
def update_shipment_table(ShipmentData,HouseBillInfo):
    try:
        tempData = ['CustomerNo','BillToAcct']
        for i in tempData:
            HouseBillInfo.pop(i)
        HouseBillNo = ShipmentData['Housebill']
        FileNumber = ShipmentData['ShipQuoteNo']
        ShipmentInfo = {}
        ShipmentInfo['HouseBillNumber'] = {'S': HouseBillNo}
        ShipmentInfo['File Number'] = {'S': FileNumber}
        ShipmentInfo['Record Status'] = {'S': 'True'}
        ShipmentInfo['Shipment Status'] = {'S': 'Pending'}
        for k,v in HouseBillInfo.items():
            ShipmentInfo[k] = {'S': v}
        print("DynamoDB Data is:", ShipmentInfo)
        response = client.put_item(
            TableName = shipment_details_table,
            Item = ShipmentInfo
        )
        return response
    except error as e:
        raise error({"Error": True,"message":str(e)})
class error(Exception):
    def __init___(self, message):
        Exception.__init__(self, "error : {}".format(message))
        self.message = message
        #Python inbuilt error class to change the error into stack format