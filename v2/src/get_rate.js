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
  console.info(event);
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
    newJSON.RatingInput.PickupTime = reqFields.pickupTime.toString();
    newJSON.RatingInput.PickupDate = reqFields.pickupTime.toString();
    newJSON.RatingInput.PickupLocationCloseTime =
      reqFields.pickupTime.toString();
  }
  newJSON.RatingInput.RequestID = 20221104;
  customer_id = event.enhancedAuthContext.customerId;
  console.info("ReqFields Filled", newJSON);
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
      newJSON.RatingInput.BillToNo = resp["BillToAcct"]["S"];
    }
  }
  if (
    "customerNumber" in body.shipmentRateRequest &&
    Number.isInteger(Number(body.shipmentRateRequest.customerNumber))
  ) {
    newJSON.RatingInput.BillToNo = body.shipmentRateRequest.customerNumber;
  }
  console.info("BillToFilled: ", newJSON);
  if ("insuredValue" in body.shipmentRateRequest) {
    try {
      if (Number(body.shipmentRateRequest.insuredValue) > 0) {
        newJSON.RatingInput.LiabilityType = "INSP";
        newJSON.RatingInput.DeclaredValue =
          body.shipmentRateRequest.insuredValue;
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

  console.info("RatingInput Updated", newJSON);

  try {
    if ("shipmentLines" in body.shipmentRateRequest) {
      newJSON.CommodityInput.CommodityInput = addCommodityWeightPerPiece(
        body.shipmentRateRequest
      );
    }
    console.info("ShipLines ", newJSON);
    // newJSON.CommodityInput = addCommodityWeightPerPiece(
    //   body.shipmentRateRequest
    // );
    if ("accessorialList" in body.shipmentRateRequest) {
      newJSON.AccessorialInput = {};
      newJSON.AccessorialInput.AccessorialInput = [];
      for (
        let x = 0;
        x < body.shipmentRateRequest.accessorialList.length;
        x++
      ) {
        console.info(body.shipmentRateRequest.accessorialList[x]);
        newJSON.AccessorialInput.AccessorialInput.push({
          AccessorialCode: body.shipmentRateRequest.accessorialList[x],
        });
      }
    }
    console.info("accessorialList", newJSON.AccessorialInput);

    const postData = makeJsonToXml(newJSON);
    console.info("postData", postData);
    // return {};
    const dataResponse = await getRating(postData);
    console.info(dataResponse);
    const dataObj = {};
    dataObj.shipmentRateResponse = makeXmlToJson(dataResponse);

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
  for (const key in inputData.shipmentLines[0]) {
    if (key == "dimUOM") {
      if (inputData.shipmentLines[0][key].toLowerCase() == "cm") {
        if ("length" in inputData.shipmentLines[0]) {
          try {
            inputData.shipmentLines[0].length = Math.round(
              inputData.shipmentLines[0].length * 2.54
            );
          } catch {
            console.info("invalid value for length");
          }
        }
        if ("width" in inputData.shipmentLines[0]) {
          try {
            inputData.shipmentLines[0].width = Math.round(
              inputData.shipmentLines[0].width * 2.54
            );
          } catch {
            console.info("invalid value for width");
          }
        }
        if ("height" in inputData.shipmentLines[0]) {
          try {
            inputData.shipmentLines[0].height = Math.round(
              inputData.shipmentLines[0].height * 2.54
            );
          } catch {
            console.info("invalid value for height");
          }
        }
      }
    } else if (key == "weightUOM") {
      if (inputData.shipmentLines[0][key].toLowerCase() == "kg") {
        if ("weight" in inputData.shipmentLines[0]) {
          try {
            inputData.shipmentLines[0].weight = Math.round(
              inputData.shipmentLines[0].weight * 2.2046
            );
          } catch {
            console.info("invalid value for weight");
          }
        }
      }
    }
  }
  console.info("inputdata.ShipmentLines: ", inputData.shipmentLines);
  for (const shipKey in inputData.shipmentLines[0]) {
    if (shipKey.includes("//")) {
      continue;
    }
    if (shipKey != "dimUOM" && shipKey != "weightUOM") {
      if (
        shipKey == "pieces" ||
        shipKey == "weight" ||
        shipKey == "length" ||
        shipKey == "height" ||
        shipKey == "width"
      ) {
        if (Number.isInteger(Number(inputData.shipmentLines[0][shipKey]))) {
          new_key =
            "Commodity" + shipKey.charAt(0).toUpperCase() + shipKey.slice(1);
          commodityInput.CommodityInput[new_key] =
            inputData.shipmentLines[0][shipKey];
        }
      } else {
        new_key =
          "Commodity" + shipKey.charAt(0).toUpperCase() + shipKey.slice(1);
        commodityInput.CommodityInput[new_key] =
          inputData.shipmentLines[0][shipKey];
      }
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
    console.info(obj);
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
      console.info("modifiedObj", modifiedObj);

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
            // list.push(e.AccessorialOutput.AccessorialOutput);
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
          let EstimatedDelivery = new Date(e.DeliveryDate);

          let ampm = e.DeliveryTime.split(" ");
          let t = ampm[0].split(":");

          if (ampm[1].toUpperCase() == "PM") {
            EstimatedDelivery.setHours(Number(t[0]) + 12);
          } else {
            EstimatedDelivery.setHours(Number(t[0]));
          }

          EstimatedDelivery.setMinutes(t[1]);
          EstimatedDelivery.setSeconds(t[2]);

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
          list.push(modifiedObj.AccessorialOutput.AccessorialOutput);
          AccessorialOutput = list;
        } else {
          const list = [];
          // list.push(e.AccessorialOutput.AccessorialOutput);
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

        let EstimatedDelivery = new Date(e.DeliveryDate);

        let ampm = e.DeliveryTime.split(" ");
        let t = ampm[0].split(":");

        if (ampm[1].toUpperCase() == "PM") {
          EstimatedDelivery.setHours(Number(t[0]) + 12);
        } else {
          EstimatedDelivery.setHours(Number(t[0]));
        }

        EstimatedDelivery.setMinutes(t[1]);
        EstimatedDelivery.setSeconds(t[2]);
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
      console.info("Dynamo resp: ", response.Items);
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
    throw e.hasOwnProperty("response") ? "Request failed" : e;
  }
}
