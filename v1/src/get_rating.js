/*
* File: v1\src\get_rating.js
* Project: Omni-datawarehouse-api-services
* Author: Bizcloud Experts
* Date: 2023-03-04
* Confidential and Proprietary
*/
const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert } = require("xmlbuilder2");

const CommodityInputValidation = {
  CommodityPieces: Joi.number().integer().required(),
  CommodityWeightLB: Joi.number().integer().required(),
  CommodityLengthIN: Joi.number().integer().required(),
  CommodityWidthIN: Joi.number().integer().required(),
  CommodityHeightIN: Joi.number().integer().required(),
};
const AccessorialInputValidation = {
  Code: Joi.string().alphanum().required(),
};
const eventValidation = Joi.object().keys({
  RatingInput: Joi.object()
    .keys({
      OriginZip: Joi.string().alphanum().required(),
      DestinationZip: Joi.string().alphanum().required(),
      PickupTime: Joi.date().iso().greater("now").required(),
    })
    .required(),
  CommodityInput: Joi.array().items(CommodityInputValidation).required(),
  "New Shipment Accessorials List": Joi.array().items(
    AccessorialInputValidation
  ),
});

function isArray(a) {
  return !!a && a.constructor === Array;
}

module.exports.handler = async (event, context, callback) => {
  console.log("Event", event);
  const { body } = event;
  const LiabilityType = "LL";

  const apiKey = event.headers["x-api-key"];

  const { error, value } = eventValidation.validate(body);
  if (error) {
    let msg = error.details[0].message
      .split('" ')[1]
      .replace(new RegExp('"', "g"), "");
    let key = error.details[0].context.key;
    return callback(response("[400]", key + " " + msg));
  }
  let eventBody = value;
  const PickupTime = body.RatingInput.PickupTime.toString();

  eventBody.RatingInput.LiabilityType = LiabilityType;
  eventBody.RatingInput.PickupDate = PickupTime;
  eventBody.RatingInput.PickupTime = PickupTime;
  eventBody.RatingInput.PickupLocationCloseTime = PickupTime;

  try {
    const customerData = await getCustomerId(apiKey);
    eventBody.RatingInput.WebTrakUserID = customerData.WebTrackId;

    eventBody.CommodityInput = addCommodityWeightPerPiece(
      eventBody.CommodityInput
    );
    if (eventBody.hasOwnProperty("New Shipment Accessorials List")) {
      eventBody.AccessorialInput = {
        AccessorialInput: eventBody["New Shipment Accessorials List"].map(
          (e) => ({ AccessorialCode: e.Code })
        ),
      };
      delete eventBody["New Shipment Accessorials List"];
    }

    const postData = makeJsonToXml(eventBody);
    console.log("postData", postData);
    // return {};
    const dataResponse = await getRating(postData);
    const dataObj = makeXmlToJson(dataResponse);
    if (
      dataObj.hasOwnProperty("Message") &&
      dataObj.Message == "WebTrakUserID is invalid."
    ) {
      return callback(response("[500]", "WebTrakUserID is invalid"));
    }

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
  return {
    CommodityInput: inputData.map((obj) => ({
      CommodityPieces: obj.CommodityPieces,
      CommodityWeightPerPiece: Math.round(
        obj.CommodityWeightLB / obj.CommodityPieces
      ),
      CommodityWeight: obj.CommodityWeightLB,
      CommodityLength: obj.CommodityLengthIN,
      CommodityWidth: obj.CommodityWidthIN,
      CommodityHeight: obj.CommodityHeightIN,
    })),
  };
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

async function getCustomerId(ApiKey) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.TOKEN_VALIDATOR,
      FilterExpression: "#ApiKey = :ApiKey",
      ExpressionAttributeNames: { "#ApiKey": "ApiKey" },
      ExpressionAttributeValues: { ":ApiKey": ApiKey },
    };
    const response = await documentClient.scan(params).promise();
    if (response.Items && response.Items.length > 0) {
      if (
        !response.Items[0].hasOwnProperty("WebTrackId") ||
        response.Items[0].WebTrackId == null
      ) {
        throw "No valid WebTrackId";
      }
      return response.Items[0];
    } else {
      throw "Invalid API Key";
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
