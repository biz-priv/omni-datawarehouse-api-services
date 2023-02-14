const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");

//1. do a joi valiation
const housebillSchema = Joi.object({
  housebill: Joi.string().required().max(13),
  docType: Joi.string()
    .required()
    .valid(
      "CERTIFICAT",
      "CONSULAR",
      "CUST RATE",
      "CUSTOMS",
      "DANGEROUS",
      "DCCL",
      "DECON",
      "HCPOD",
      "IBU",
      "IMPORT LIC",
      "INSURANCE",
      "INVOICE",
      "MSDS",
      "OCCL",
      "OMNI RA",
      "ORIG BOL",
      "PACKING",
      "PO",
      "POD",
      "PRO FORMA",
      "RA",
      "SED",
      "SLI",
      "WAYBILL"
    ),
});
const fileNumberSchema = Joi.object({
  fileNumber: Joi.string().required().max(13),
  docType: Joi.string()
    .required()
    .valid(
      "CERTIFICAT",
      "CONSULAR",
      "CUST RATE",
      "CUSTOMS",
      "DANGEROUS",
      "DCCL",
      "DECON",
      "HCPOD",
      "IBU",
      "IMPORT LIC",
      "INSURANCE",
      "INVOICE",
      "MSDS",
      "OCCL",
      "OMNI RA",
      "ORIG BOL",
      "PACKING",
      "PO",
      "POD",
      "PRO FORMA",
      "RA",
      "SED",
      "SLI",
      "WAYBILL"
    ),
});

module.exports.handler = async (event) => {
  try {
    console.log("Event", event);
    const eventParams = event.queryStringParameters;
    const xApiKey = event.headers;
    // const eventParams = event;
    let response;
    let newResponse;
    console.log("process.env.GETDOCUMENT_API", process.env.GETDOCUMENT_API);
    //2. valiadte the params
    if (!eventParams) {
      return { Msg: "housebill or fileNumber parameters are require" };
    } else if (eventParams.hasOwnProperty("housebill")) {
      //3. if params are there and validated
      await housebillSchema.validateAsync(eventParams);
      console.log("housebill", eventParams);
      //4. hit the websli api get the response
      const config = {
        headers: {
          "x-api-key": xApiKey["x-api-key"],
        },
      };
      response = await axios.get(
        `https://websli.omnilogistics.com/wtTest/getwtdoc/v1/json/${xApiKey["x-api-key"]}/housebill=${eventParams.housebill}/doctype=${eventParams.docType}/`,
        config
      );

      console.log("response", response.data);
      response = response.data;
    } else {
      //3. if params are there and validated
      await fileNumberSchema.validateAsync(eventParams);
      console.log("fileNumber", eventParams);

      //4. hit the websli api get the response
      const config = {
        headers: {
          "x-api-key": xApiKey["x-api-key"],
        },
      };
      response = await axios.get(
        // `${process.env.GETDOCUMENT_API}?fileNumber=${eventParams.housebill}&docType=${eventParams.docType}`,
        `https://websli.omnilogistics.com/wtTest/getwtdoc/v1/json/${xApiKey["x-api-key"]}/fileNumber=${eventParams.fileNumber}/doctype=${eventParams.docType}/`,
        config
      );

      console.log("response", response.data);
      response = response.data;
    }
    //5. change the response structre
    newResponse = await newResponseStructureForV2(response);
    console.log("newResponse", newResponse);
    //6. send the response
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newResponse),
    };
  } catch (error) {
    console.log("error", error);
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(error),
    };
  }
};

async function newResponseStructureForV2(response) {
  return new Promise((resolve, reject) => {
    const newResponse = {
      housebill: response?.wtDocs?.housebill ? response.wtDocs.housebill : "",
      fileNumber: response?.wtDocs?.fileNumber
        ? response.wtDocs.fileNumber
        : "",
      documents: response?.wtDocs?.wtDoc ? response.wtDocs.wtDoc : [],
    };

    resolve({ getDocumentResponse: newResponse });
  });
}
