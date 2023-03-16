const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert } = require("xmlbuilder2");

const eventValidation = Joi.object().keys({
  shipperZip: Joi.string().required(),
  consigneeZip: Joi.string().required(),
  pickupTime: Joi.date().iso().greater("now").required(),
  customerNumber: Joi.number().integer().max(999999),
  shipmentLines: Joi.array()
    .items(
      Joi.object({
        pieces: Joi.number().integer().required(),
        pieceType: Joi.any(),
        weight: Joi.number().integer().max(99999).required(),
        length: Joi.number().integer().max(999).required(),
        width: Joi.number().integer().max(999).required(),
        height: Joi.number().integer().max(999).required(),
        hazmat: Joi.any(),
        dimUOM: Joi.string()
          .valid("in", "In", "IN", "cm", "Cm", "CM")
          .required(),
        weightUOM: Joi.string()
          .valid("kg", "Kg", "KG", "lb", "Lb", "LB")
          .required(),
      })
    )
    .required(),
});

function isArray(a) {
  return !!a && a.constructor === Array;
}

module.exports.handler = async (event, context, callback) => {
  if (event.source === 'serverless-plugin-warmup') {
    console.log(JSON.stringify( { "environment": process.env.stage,"message": "WarmUp - Lambda is warm!", "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));
    return 'Lambda is warm!';
  }
  console.log(JSON.stringify( { "environment": process.env.stage,"message": {"event: ":event}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));
  const { body } = event;
  const apiKey = event.headers["x-api-key"];
  let reqFields = {};
  let valError;
  let newJSON = {
    RatingInput: {},
    CommodityInput: {
      CommodityInput: {},
    },
  };
  if (
    !("enhancedAuthContext" in event) ||
    !("customerId" in event.enhancedAuthContext)
  ) {
    valError = "CustomerId not found.";
  } else if (!("shipmentRateRequest" in body)) {
    valError = "shipmentRateRequest is required.";
  } else if (
    !("shipperZip" in body.shipmentRateRequest) ||
    !("consigneeZip" in body.shipmentRateRequest) ||
    !("pickupTime" in body.shipmentRateRequest)
  ) {
    valError =
      "shipperZip, consigneeZip, and pickupTime are required fields. Please ensure you are sending all 3 of these values.";
  } else if (
    !Number.isInteger(Number(body.shipmentRateRequest.shipperZip)) ||
    !Number.isInteger(Number(body.shipmentRateRequest.consigneeZip))
  ) {
    valError = "Invalid zip value.";
  } else if (
    event.enhancedAuthContext.customerId == "customer-portal-admin" &&
    !("customerNumber" in body.shipmentRateRequest)
  ) {
    valError = "customerNumber is a required field for this request.";
  } else if (
    !("shipmentLines" in body.shipmentRateRequest) ||
    body.shipmentRateRequest.shipmentLines.length <= 0
  ) {
    valError = "At least 1 shipmentLine is required for this request.";
  } else {
    reqFields.shipperZip = body.shipmentRateRequest.shipperZip;
    reqFields.consigneeZip = body.shipmentRateRequest.consigneeZip;
    reqFields.pickupTime = body.shipmentRateRequest.pickupTime;
    reqFields.shipmentLines = [];

    for (let i = 0; i < body.shipmentRateRequest.shipmentLines.length; i++) {
      reqFields.shipmentLines.push({});
      for (let key in body.shipmentRateRequest.shipmentLines[i]) {
        if (!key.includes("//")) {
          reqFields.shipmentLines[i][key] =
            body.shipmentRateRequest.shipmentLines[i][key];
        }
      }
    }
  }

  const { error, value } = eventValidation.validate(reqFields);

  if (valError) {
    console.log(JSON.stringify( { "environment": process.env.stage,"message": {"valError: ":valError}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));
    return callback(response("[400]", valError));
  } else if (error) {
    let msg = error.details[0].message
      .split('" ')[1]
      .replace(new RegExp('"', "g"), "");
    let key = error.details[0].context.key;
    console.log(JSON.stringify( { "environment": process.env.stage,"message": {"MessageError [400]:":error}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));
    if(error.toString().includes('shipmentLines')){
      return callback(response("[400]", "shipmentLines."+key + error.details[0].message.split('"')[2]));
    } else {
      return callback(response("[400]", key + " " + error));
    } 
  } else {
    newJSON.RatingInput.OriginZip = reqFields.shipperZip;
    newJSON.RatingInput.DestinationZip = reqFields.consigneeZip;
    newJSON.RatingInput.PickupTime = reqFields.pickupTime.toString();
    newJSON.RatingInput.PickupDate = reqFields.pickupTime.toString();
    newJSON.RatingInput.PickupLocationCloseTime =
      reqFields.pickupTime.toString();
  }
  newJSON.RatingInput.RequestID = 20221104;
  customer_id = event.enhancedAuthContext.customerId;
  console.log(JSON.stringify( { "environment": process.env.stage,"message": {"ReqFields Filled: ":newJSON}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));
  if (customer_id != "customer-portal-admin") {
    let resp = await getCustomerId(customer_id);
    if (resp == "failure") {
      return callback(
        response(
          "[400]",
          "Customer Information does not exist. Please raise a support ticket to add the customer"
        )
      );
    } else {
      newJSON.RatingInput.BillToNo = resp["BillToAcct"];
    }
  }
  if (
    "customerNumber" in body.shipmentRateRequest &&
    Number.isInteger(Number(body.shipmentRateRequest.customerNumber)) &&
    newJSON.RatingInput.BillToNo == undefined
  ) {
    newJSON.RatingInput.BillToNo = body.shipmentRateRequest.customerNumber;
  }
  console.log(JSON.stringify( { "environment": process.env.stage,"message": {"BillToFilled: ":newJSON}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));
  if ("insuredValue" in body.shipmentRateRequest) {
    try {
      if (
        Number(body.shipmentRateRequest.insuredValue) > 0 &&
        Number(body.shipmentRateRequest.insuredValue) <=
          9999999999999999999999999999n
      ) {
        newJSON.RatingInput.LiabilityType = "INSP";
        newJSON.RatingInput.DeclaredValue =
          body.shipmentRateRequest.insuredValue.toLocaleString("fullwide", {
            useGrouping: false,
          });
      } else {
        newJSON.RatingInput.LiabilityType = "LL";
      }
    } catch {
      newJSON.RatingInput.LiabilityType = "LL";
    }
  }
  if (
    "commodityClass" in body.shipmentRateRequest &&
    Number(body.shipmentRateRequest.commodityClass) != NaN
  ) {
    newJSON.RatingInput.CommodityClass = Number(
      body.shipmentRateRequest.commodityClass
    );
  }

  console.log(JSON.stringify( { "environment": process.env.stage,"message": {"RatingInput Updated: ":newJSON}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));

  try {
    newJSON.CommodityInput.CommodityInput = addCommodityWeightPerPiece(
      body.shipmentRateRequest
    );
    console.log(JSON.stringify( { "environment": process.env.stage,"message": {"ShipLines: ":newJSON}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));
    // newJSON.CommodityInput = addCommodityWeightPerPiece(
    //   body.shipmentRateRequest
    // );
    if ("accessorialList" in body.shipmentRateRequest) {
      newJSON.AccessorialInput = {};
      newJSON.AccessorialInput.AccessorialInput = {
        AccessorialCode: [],
      };
      for (
        let x = 0;
        x < body.shipmentRateRequest.accessorialList.length;
        x++
      ) {
        newJSON.AccessorialInput.AccessorialInput.AccessorialCode.push(
          body.shipmentRateRequest.accessorialList[x]
        );
      }
    }
    console.log(JSON.stringify( { "environment": process.env.stage,"message": {"accessorialList: ":newJSON.AccessorialInput}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));    

    const postData = makeJsonToXml(newJSON);
    console.log(JSON.stringify( { "environment": process.env.stage,"message": {"postData: ":postData}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));    
    // return {};
    const dataResponse = await getRating(postData);
    console.log(JSON.stringify( { "environment": process.env.stage,"message": {"dataResponse: ":dataResponse}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));    
    const dataObj = {};
    dataObj.shipmentRateResponse = makeXmlToJson(dataResponse);

    if ("Error" in dataObj.shipmentRateResponse) {
      return callback(response("[400]", dataObj.shipmentRateResponse.Error));
    } else {
      for(let m=0;m<dataObj.shipmentRateResponse.length;m++){
        if(typeof(dataObj.shipmentRateResponse[m].accessorialList)=='string'){
          dataObj.shipmentRateResponse[m].accessorialList = []
        }
      }
      return dataObj;
    }
  } catch (error) {
    return callback(
      response(
        "[400]",
        error != null && error.hasOwnProperty("message") ? error.message : error
      )
    );
  }
};

function addCommodityWeightPerPiece(inputData) {
  let commodityInput = {
    CommodityInput: {},
  };
  if (inputData.shipmentLines[0].dimUOM.toLowerCase() == "cm") {
    inputData.shipmentLines[0].length = Math.round(
      inputData.shipmentLines[0].length * 2.54
    );
    inputData.shipmentLines[0].width = Math.round(
      inputData.shipmentLines[0].width * 2.54
    );
    inputData.shipmentLines[0].height = Math.round(
      inputData.shipmentLines[0].height * 2.54
    );
  }
  if (inputData.shipmentLines[0].weightUOM.toLowerCase() == "kg") {
    inputData.shipmentLines[0].weight = Math.round(
      inputData.shipmentLines[0].weight * 2.2046
    );
  }
  console.log(JSON.stringify( { "environment": process.env.stage,"message": {"inputdata.ShipmentLines: ":inputData.shipmentLines}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));    
  for (const shipKey in inputData.shipmentLines[0]) {
    if (shipKey.includes("//")) {
      continue;
    }
    if (shipKey != "dimUOM" && shipKey != "weightUOM") {
      new_key =
        "Commodity" + shipKey.charAt(0).toUpperCase() + shipKey.slice(1);
      commodityInput.CommodityInput[new_key] =
        inputData.shipmentLines[0][shipKey];
    }
  }

  return commodityInput.CommodityInput;
}

function makeJsonToXml(data) {
  return convert({
    "soap12:Envelope": {
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      "@xmlns:soap12": "http://www.w3.org/2003/05/soap-envelope",
      "soap12:Body": {
        GetRatingByCustomer: {
          "@xmlns": "http://tempuri.org/",
          RatingParam: data,
        },
      },
    },
  });
}

function makeXmlToJson(data) {
  try {
    let obj = convert(data, { format: "object" });
    console.log(JSON.stringify( { "environment": process.env.stage,"message": {"obj: ":obj}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));    
    if (
      obj["soap:Envelope"][
        "soap:Body"
      ].GetRatingByCustomerResponse.GetRatingByCustomerResult.hasOwnProperty(
        "RatingOutput"
      )
    ) {
      const modifiedObj =
        obj["soap:Envelope"]["soap:Body"].GetRatingByCustomerResponse
          .GetRatingByCustomerResult.RatingOutput;
      console.log(JSON.stringify( { "environment": process.env.stage,"message": {"modifiedObj: ":modifiedObj}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));    

      if (isArray(modifiedObj)) {
        console.log(JSON.stringify( { "environment": process.env.stage,"message": "isArray", "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));    
        return modifiedObj.map((e) => {
          if (isEmpty(e.Message)) {
            e.Message = "";
          }
          let AccessorialOutput = null;
          if (
            e.AccessorialOutput &&
            e.AccessorialOutput.AccessorialOutput &&
            e.AccessorialOutput.AccessorialOutput[0] == null
          ) {
            const list = [];
            for (
              let i = 0;
              i < e.AccessorialOutput.AccessorialOutput.length;
              i++
            ) {
              list[i] = {};
              e.AccessorialOutput.AccessorialOutput[i].AccessorialCode
                ? (list[i].code =
                    e.AccessorialOutput.AccessorialOutput[i].AccessorialCode)
                : e.AccessorialOutput.AccessorialOutput[i].AccessorialDesc
                ? (list[i].description =
                    e.AccessorialOutput.AccessorialOutput[i].AccessorialDesc)
                : e.AccessorialOutput.AccessorialOutput[i].AccessorialCharge
                ? (list[i].charge =
                    e.AccessorialOutput.AccessorialOutput[i].AccessorialCharge)
                : console.info("no charge");
            }
            AccessorialOutput = list;
          } else {
            const list = [];
            if (e.AccessorialOutput.AccessorialOutput) {
              for (
                let i = 0;
                i < e.AccessorialOutput.AccessorialOutput.length;
                i++
              ) {
                list[i] = {};
                list[i].code =
                  e.AccessorialOutput.AccessorialOutput[i].AccessorialCode;
                list[i].description =
                  e.AccessorialOutput.AccessorialOutput[i].AccessorialDesc;
                list[i].charge =
                  e.AccessorialOutput.AccessorialOutput[i].AccessorialCharge;
              }
              AccessorialOutput = list;
            }
          }
          let EstimatedDelivery;
          if (e.DeliveryTime && e.DeliveryTime != null) {
            EstimatedDelivery = new Date(modifiedObj.DeliveryDate);

            let ampm = e.DeliveryTime.toString().split(" ");
            let t = ampm[0].split(":");

            if (ampm[1].toUpperCase() == "PM") {
              EstimatedDelivery.setHours(Number(t[0]) + 12);
            } else {
              EstimatedDelivery.setHours(Number(t[0]));
            }

            EstimatedDelivery.setMinutes(t[1]);
            EstimatedDelivery.setSeconds(t[2]);
          }
          if (
            e.ServiceLevelID.length == undefined &&
            e.DeliveryTime.length == undefined &&
            e.Message != null
          ) {
            return { Error: e.Message };
          }

          return {
            serviceLevel: e.ServiceLevelID,
            estimatedDelivery:
              e.DeliveryDate == "1/1/1900" ? "" : EstimatedDelivery,
            totalRate: e.StandardTotalRate,
            freightCharge: e.StandardFreightCharge,
            accessorialList: AccessorialOutput == null ? "" : AccessorialOutput,
            message: e.Message,
          };
        });
      } else {
        console.log(JSON.stringify( { "environment": process.env.stage,"message": "object", "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));    
        if (isEmpty(modifiedObj.Message)) {
          modifiedObj.Message = "";
        }
        let AccessorialOutput = null;
        if (
          modifiedObj.AccessorialOutput &&
          modifiedObj.AccessorialOutput.AccessorialOutput &&
          modifiedObj.AccessorialOutput.AccessorialOutput[0] == null
        ) {
          const list = [];
          for (
            let i = 0;
            i < modifiedObj.AccessorialOutput.AccessorialOutput.length;
            i++
          ) {
            list[i] = {};
            modifiedObj.AccessorialOutput.AccessorialOutput[i].AccessorialCode
              ? (list[i].code =
                  modifiedObj.AccessorialOutput.AccessorialOutput[
                    i
                  ].AccessorialCode)
              : modifiedObj.AccessorialOutput.AccessorialOutput[i]
                  .AccessorialDesc
              ? (list[i].description =
                  modifiedObj.AccessorialOutput.AccessorialOutput[
                    i
                  ].AccessorialDesc)
              : modifiedObj.AccessorialOutput.AccessorialOutput[i]
                  .AccessorialCharge
              ? (list[i].charge =
                  modifiedObj.AccessorialOutput.AccessorialOutput[
                    i
                  ].AccessorialCharge)
              : console.info("no charge");
          }
          AccessorialOutput = list;
        } else {
          const list = [];
          if (modifiedObj.AccessorialOutput.AccessorialOutput) {
            for (
              let i = 0;
              i < modifiedObj.AccessorialOutput.AccessorialOutput.length;
              i++
            ) {
              list[i] = {};
              list[i].code =
                modifiedObj.AccessorialOutput.AccessorialOutput[
                  i
                ].AccessorialCode;
              list[i].description =
                modifiedObj.AccessorialOutput.AccessorialOutput[
                  i
                ].AccessorialDesc;
              list[i].charge =
                modifiedObj.AccessorialOutput.AccessorialOutput[
                  i
                ].AccessorialCharge;
            }
            AccessorialOutput = list;
          }
        }
        let EstimatedDelivery;
        if (modifiedObj.DeliveryTime && modifiedObj.DeliveryTime != null) {
          EstimatedDelivery = new Date(modifiedObj.DeliveryDate);

          let ampm = modifiedObj.DeliveryTime.toString().split(" ");
          let t = ampm[0].split(":");

          if (ampm[1].toUpperCase() == "PM") {
            EstimatedDelivery.setHours(Number(t[0]) + 12);
          } else {
            EstimatedDelivery.setHours(Number(t[0]));
          }

          EstimatedDelivery.setMinutes(t[1]);
          EstimatedDelivery.setSeconds(t[2]);
        }

        if (
          modifiedObj.ServiceLevelID.length == undefined &&
          modifiedObj.DeliveryTime.length == undefined &&
          modifiedObj.Message != null
        ) {
          return { Error: modifiedObj.Message };
        } else {
          return {
            serviceLevel: modifiedObj.ServiceLevelID,
            estimatedDelivery:
              modifiedObj.DeliveryDate == "1/1/1900" ? "" : EstimatedDelivery,
            totalRate: modifiedObj.StandardTotalRate,
            freightCharge: modifiedObj.StandardFreightCharge,
            accessorialList: AccessorialOutput == null ? "" : AccessorialOutput,
            message: modifiedObj.Message,
          };
        }
      }
    } else {
      throw "Rate not found.";
    }
  } catch (e) {
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}

function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}

async function getCustomerId(customerId) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.ACCOUNT_INFO_TABLE,
      IndexName: process.env.ACCOUNT_INFO_TABLE_INDEX,
      KeyConditionExpression: "CustomerID = :CustomerID",
      ExpressionAttributeValues: { ":CustomerID": customerId },
    };
    const response = await documentClient.query(params).promise();
    if (response.Items && response.Items.length > 0) {
      console.log(JSON.stringify( { "environment": process.env.stage,"message": {"Dynamo resp: ":response.Items}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));    
      return response.Items[0];
    } else {
      return "failure";
    }
  } catch (e) {
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}

async function getRating(postData) {
  try {
    const res = await axios.post(process.env.RATING_API, postData, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
    if (res.status == 200) {
      return res.data;
    } else {
      throw e.response.statusText;
    }
  } catch (e) {
    let obj = convert(e.response.data, { format: "object" });
    let errorMessage = obj['soap:Envelope']['soap:Body']['soap:Fault']['soap:Reason']['soap:Text']["#"]
    console.log(JSON.stringify( { "environment": process.env.stage,"message": {"error response: ":e.response}, "service-name": "omni-dw-api-services", "application": "DataWarehouse", "region": process.env.region, "functionName": context.functionName }));    
    throw e.hasOwnProperty("response") ? errorMessage : e;
  }
}
