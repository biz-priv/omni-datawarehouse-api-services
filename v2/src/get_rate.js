const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert } = require("xmlbuilder2");

const eventValidation = Joi.object().keys({
  shipperZip: Joi.number().integer().max(99999).min(10000).required(),
  consigneeZip: Joi.number().integer().max(99999).min(10000).required(),
  pickupTime: Joi.date().iso().greater("now").required(),
  customerNumber: Joi.number().integer().max(999999),
});

function isArray(a) {
  return !!a && a.constructor === Array;
}

module.exports.handler = async (event, context, callback) => {
  console.log(event);
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
  } else {
    reqFields.shipperZip = body.shipmentRateRequest.shipperZip;
    reqFields.consigneeZip = body.shipmentRateRequest.consigneeZip;
    reqFields.pickupTime = body.shipmentRateRequest.pickupTime;
  }

  
  const { error, value } = eventValidation.validate(reqFields);

  if (valError) {
    console.info(valError);
    return callback(response("[400]", valError));
  } else if (error) {
    let msg = error.details[0].message
      .split('" ')[1]
      .replace(new RegExp('"', "g"), "");
    let key = error.details[0].context.key;
    console.info("MessageError", "[400]", error);
    return callback(response("[400]", key + " " + error));
  } else {
    newJSON.RatingInput.OriginZip = reqFields.shipperZip;
    newJSON.RatingInput.DestinationZip = reqFields.consigneeZip;
    newJSON.RatingInput.PickupTime =
      reqFields.pickupTime.toString();
    newJSON.RatingInput.PickupDate =
      reqFields.pickupTime.toString();
    newJSON.RatingInput.PickupLocationCloseTime =
      reqFields.pickupTime.toString();
  }
  newJSON.RatingInput.RequestID = 20221104;
  customer_id = event.enhancedAuthContext.customerId;
  console.info("ReqFields Filled",newJSON)
  if(customer_id != 'customer-portal-admin'){
    let resp = await getCustomerId(customer_id)
    if(resp == 'failure'){
      return callback(response("[400]", 'Customer Information does not exist. Please raise a support ticket to add the customer'));
    } else {
      newJSON.RatingInput.BillToNo = resp['BillToAcct']['S']
    }
  } 
  if ("customerNumber" in body.shipmentRateRequest) {
    newJSON.RatingInput.BillToNo = reqFields.customerNumber;
  }
  console.info("BillToFilled: ",newJSON)
  if ("insuredValue" in body.shipmentRateRequest) {
    try {
      if (body.shipmentRateRequest.insuredValue > 0) {
        newJSON.RatingInput.LiabilityType = "INSP";
      } else {
        newJSON.RatingInput.LiabilityType = "LL";
      }
    } catch {
      newJSON.RatingInput.LiabilityType = "LL";
    }
  }
  console.info("Liability",newJSON)
  // console.log(body.shipmentRateRequest);

  // let eventBody = value;
  // const PickupTime = body.shipmentRateRequest.pickupTime.toString();

  // eventBody.shipmentRateRequest.LiabilityType = LiabilityType;
  // eventBody.shipmentRateRequest.PickupDate = PickupTime;
  // eventBody.shipmentRateRequest.PickupTime = PickupTime;
  // eventBody.shipmentRateRequest.PickupLocationCloseTime = PickupTime;

  try {
    if ("shipmentLines" in body.shipmentRateRequest) {
      newJSON.CommodityInput.CommodityInput =
        addCommodityWeightPerPiece(body.shipmentRateRequest);
    }
    console.info("ShipLines ",newJSON)
    // newJSON.CommodityInput = addCommodityWeightPerPiece(
    //   body.shipmentRateRequest
    // );
    if ("accessorialList" in body.shipmentRateRequest) {
      newJSON.AccessorialInput = {
        AccessorialInput: body.shipmentRateRequest.accessorialList.map((e) => ({
          AccessorialCode: e.Code,
        })),
      };
      delete body.shipmentRateRequest["accessorialList"];
    }
    console.info("accessorialList",newJSON)

    const postData = makeJsonToXml(newJSON);
    console.log("postData", postData);
    // return {};
    const dataResponse = await getRating(postData);
    const dataObj = makeXmlToJson(dataResponse);

    return dataObj;
  } catch (error) {
    return callback(
      response(
        "[500]",
        error != null && error.hasOwnProperty("message") ? error.message : error
      )
    );
  }
};

function addCommodityWeightPerPiece(inputData) {
  let commodityInput = {
    CommodityInput: {},
  };
  for (const key in inputData.shipmentLines) {
    if (key == "dimUOM") {
      if (inputData[key].toLowerCase() == "cm") {
        if ("length" in inputData.shipmentLines) {
          try {
            inputData.shipmentLines.length =
              inputData.shipmentLines.length * 2.54;
          } catch {
            console.info("invalid value for length");
          }
        }
        if ("width" in inputData.shipmentLines) {
          try {
            inputData.shipmentLines.width =
              inputData.shipmentLines.width * 2.54;
          } catch {
            console.info("invalid value for width");
          }
        }
        if ("height" in inputData.shipmentLines) {
          try {
            inputData.shipmentLines.height =
              inputData.shipmentLines.height * 2.54;
          } catch {
            console.info("invalid value for height");
          }
        }
      }
    } else if (key == "weightUOM") {
      if (inputData[key].toLowerCase() == "kg") {
        if ("weight" in inputData.shipmentLines) {
          try {
            inputData.shipmentLines.weight =
              inputData.shipmentLines.weight * 2.2046;
          } catch {
            console.log("invalid value for weight");
          }
        }
      }
    }
  }

  for (const shipKey in inputData.shipmentLines[0]) {
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
        GetRating: {
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
    if (
      obj["soap:Envelope"][
        "soap:Body"
      ].GetRatingResponse.GetRatingResult.hasOwnProperty("RatingOutput")
    ) {
      const modifiedObj =
        obj["soap:Envelope"]["soap:Body"].GetRatingResponse.GetRatingResult
          .RatingOutput;
      console.log("modifiedObj", modifiedObj);

      if (isArray(modifiedObj)) {
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
            list.push(e.AccessorialOutput.AccessorialOutput);
            AccessorialOutput = list;
          } else {
            AccessorialOutput = e.AccessorialOutput.AccessorialOutput;
          }

          return {
            ServiceLevelID: e.ServiceLevelID,
            StandardTotalRate: e.StandardTotalRate,
            StandardFreightCharge: e.StandardFreightCharge,
            AccessorialOutput:
              AccessorialOutput == null ? "" : AccessorialOutput,
            Message: e.Message,
          };
        });
      } else {
        if (isEmpty(modifiedObj.Message)) {
          modifiedObj.Message = "";
        } else if (modifiedObj.Message.search("WebTrakUserID") != -1) {
          throw "Internal error message";
        }
        let AccessorialOutput = null;
        if (
          modifiedObj.AccessorialOutput &&
          modifiedObj.AccessorialOutput.AccessorialOutput &&
          modifiedObj.AccessorialOutput.AccessorialOutput[0] == null
        ) {
          const list = [];
          list.push(modifiedObj.AccessorialOutput.AccessorialOutput);
          AccessorialOutput = list;
        } else {
          AccessorialOutput = modifiedObj.AccessorialOutput.AccessorialOutput;
        }
        return [
          {
            ServiceLevelID: modifiedObj.ServiceLevelID,
            StandardTotalRate: modifiedObj.StandardTotalRate,
            Message: modifiedObj.Message,
            StandardFreightCharge: modifiedObj.hasOwnProperty(
              "StandardFreightCharge"
            )
              ? modifiedObj.StandardFreightCharge
              : "",
            AccessorialOutput:
              AccessorialOutput == null ? "" : AccessorialOutput,
          },
        ];
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
      KeyConditionExpression: 'CustomerID = :CustomerID',
      ExpressionAttributeValues: {":CustomerID": {"S": customerId}},
    };
    const response = await documentClient.query(params).promise();
    if (response.Items && response.Items.length > 0) {
      console.info("Dynamo resp: ", response.Items)
      return response.Items[0];
    } else {
      return 'failure';
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
    throw e.hasOwnProperty("response") ? "Request failed" : e;
  }
}
