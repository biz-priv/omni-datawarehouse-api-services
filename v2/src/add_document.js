const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const Base64 = require("js-base64");
const { convert, create } = require("xmlbuilder2");
const pdfkit = require('pdfkit');
const sizeOf = require('buffer-image-size');
const PNG = require('pngjs').PNG;
const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");
const { get } = require('lodash');

let eventLogObj = {};

module.exports.handler = async (event, context, callback) => {
  console.log("event", event);
  const { body } = event;
  let request_json = JSON.parse(JSON.stringify(body));
  request_json.documentUploadRequest.b64str = "";
  eventLogObj = {
    Id: uuidv4(),
    housebill: body?.documentUploadRequest?.housebill ?? "",
    fileNumber: body?.documentUploadRequest?.fileNumber ?? "",
    request_json: JSON.stringify(request_json),
    request_xml: "",
    response_xml: "",
    response_json: "",
    wt_status_code: "",
    api_status_code: "",
    PK_OrderNo: "",
    FK_ServiceId: "",
    addressMapObj: "",
    errorMsg: "",
    consigneeIsCustomer: "0",
    inserted_time_stamp: momentTZ
      .tz("America/Chicago")
      .format("YYYY:MM:DD HH:mm:ss")
      .toString(),
  };

  const eventValidation = Joi.object()
    .keys({
      documentUploadRequest: Joi.object()
        .keys({
          housebill: Joi.number().integer(),
          b64str: Joi.string().required(),
          contentType: Joi.any(),
          docType: Joi.string()
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
            )
            .required(),
          fileNumber: Joi.number().integer(),
        })
        .or("housebill", "fileNumber")
        .required(),
    })
    .required();
  let validator = {
    documentUploadRequest: {},
  };

  /**
   * remove comment out keys before adding to the validator object
   */
  for (let key in body.documentUploadRequest) {
    if (!key.includes("//")) {
      validator.documentUploadRequest[key] = body.documentUploadRequest[key];
    }
  }

  // validating the validator object with joi validation

  const { error } = eventValidation.validate(validator);
  if (error) {
    let msg = error.details[0].message
      .split('" ')[1]
      .replace(/"/g, "");
    let key = error.details[0].context.key;
    console.info("[400]", key + " " + msg);

    eventLogObj = {
      ...eventLogObj,
      errorMsg: JSON.stringify(key + " " + msg),
      api_status_code: "400",
    };
    console.log("eventLogObj", eventLogObj);
    await putItem(eventLogObj);

    return callback(response("[400]", key + " " + msg));
  }
  let customerId;
  let fileNumber = "";
  let housebill = "";
  let docType = "";
  let eventBody = validator;
  let fileExtension = "";
  let validated = {};
  let currentDateTime = new Date();
  validated.b64str = get(eventBody,"documentUploadRequest.b64str");
  docType = get(eventBody,"documentUploadRequest.docType");
  let contentType = get(eventBody,"documentUploadRequest.contentType")
  // If contentType is not provided, detect it from the base64 data.
  if (!contentType) {
    contentType = detectMimeType(validated.b64str);
    console.log("contentType:", contentType);
  }
  let lowercaseContentType = contentType.toLowerCase();

  if (lowercaseContentType.includes('jpeg') ||
    lowercaseContentType.includes('jpg') ||
    lowercaseContentType.includes('png')) {
    if (process.env.VALID_DOCTYPES.includes(docType)) {
      try {
        const pdfBuffer = await convertImageToPDF(Buffer.from(validated.b64str, 'base64'));
        console.log("converted to pdf");
        // Update validated object
        validated.b64str = pdfBuffer.toString('base64');
        fileExtension = ".pdf";
      } catch (conversionError) {
        console.log(conversionError);
        eventLogObj = {
          ...eventLogObj,
          errorMsg: "Error converting JPEG to PDF",
          api_status_code: "400",
        };
        console.log("eventLogObj", eventLogObj);
        await putItem(eventLogObj);
        return callback(response("[400]", "Error converting JPEG to PDF"));
      }
    } else {
      console.log("docType is not one of jpeg,jpg,png. Skipping conversion.");
    }
  }
  //checking for customerId from event if not present throw error else set the customerId

  if (
    !("enhancedAuthContext" in event) ||
    !("customerId" in event.enhancedAuthContext)
  ) {
    eventLogObj = {
      ...eventLogObj,
      errorMsg: "Unable to validate user",
      api_status_code: "400",
    };
    console.log("eventLogObj", eventLogObj);
    await putItem(eventLogObj);

    return callback(response("[400]", "Unable to validate user"));
  } else {
    customerId = event.enhancedAuthContext.customerId;
    console.log("customerId====================>", customerId);
  }

  // checking b64str is valid in the event or not

  if (eventBody.documentUploadRequest.b64str.length < 3000000) {
    let pattern =
      /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/;
    let Base64 = eventBody.documentUploadRequest.b64str.match(pattern)
      ? "Base64"
      : "Not Base64";
    if (Base64 != "Base64") {
      eventLogObj = {
        ...eventLogObj,
        errorMsg: "Please ensure b64str field is a valid base64 string",
        api_status_code: "400",
      };
      console.log("eventLogObj", eventLogObj);
      await putItem(eventLogObj);

      return callback(
        response(
          "[400]",
          "Please ensure b64str field is a valid base64 string."
        )
      );
    }
  } else if (!Base64.isValid(eventBody.documentUploadRequest.b64str)) {
    eventLogObj = {
      ...eventLogObj,
      errorMsg: "Please ensure b64str field is a valid base64 string",
      api_status_code: "400",
    };
    console.log("eventLogObj", eventLogObj);
    await putItem(eventLogObj);
    return callback(
      response("[400]", "Please ensure b64str field is a valid base64 string.")
    );
  }

  /**
   * matching customerId with "customer-portal-admin" and IVIA_CUSTOMER_ID
   * if its not a match then
   * checking housebill number
   * if have housebill then checking fileNumber from HOUSEBILL_TABLE with the housebill number, if found fileNumber then adding it in the validator obj else throw error
   * else if have fileNumber then checking housebill from HOUSEBILL_TABLE with the fileNumber, if found housebill then adding it in the validator obj else through error
   */

  if (
    customerId != "customer-portal-admin" &&
    customerId != process.env.IVIA_CUSTOMER_ID
  ) {
    if (
      "housebill" in eventBody.documentUploadRequest &&
      Number.isInteger(Number(eventBody.documentUploadRequest.housebill))
    ) {
      fileNumber = await getFileNumber(
        eventBody.documentUploadRequest.housebill,
        customerId
      );
      if (fileNumber == "failure") {
        eventLogObj = {
          ...eventLogObj,
          errorMsg: "Invalid Housebill for this customer.",
          api_status_code: "400",
        };
        console.log("eventLogObj", eventLogObj);
        await putItem(eventLogObj);
        return callback(
          response("[400]", "Invalid Housebill for this customer.")
        );
      } else {
        fileNumber = fileNumber["FileNumber"];
        validated.housebill = eventBody.documentUploadRequest.housebill;
        console.info("filenumber: ", fileNumber);
      }
    } else if (
      "fileNumber" in eventBody.documentUploadRequest &&
      Number.isInteger(Number(eventBody.documentUploadRequest.fileNumber))
    ) {
      housebill = await getHousebillNumber(
        eventBody.documentUploadRequest.fileNumber,
        customerId
      );
      if (housebill == "failure") {
        eventLogObj = {
          ...eventLogObj,
          errorMsg: "No Housebill found.",
          api_status_code: "400",
        };

        console.log("eventLogObj", eventLogObj);
        await putItem(eventLogObj);
        return callback(response("[400]", "No Housebill found."));
      } else {
        fileNumber = eventBody.documentUploadRequest.fileNumber;
        validated.housebill = housebill["HouseBillNumber"];
        console.info("housebill: ", validated.housebill);
      }
    }
  } else {
    //  if customerId with "customer-portal-admin" and IVIA_CUSTOMER_ID matches
    //  query the shipment-header table with the housebill number to find the PK_OrderNo

    if (customerId == "customer-portal-admin") {
      validated.housebill = eventBody.documentUploadRequest.housebill;
    } else {
      housebill = body.documentUploadRequest.housebill;

      const paramsshipmentHeader = {
        TableName: process.env.SHIPMENT_HEADER_TABLE,
        IndexName: "Housebill-index",
        KeyConditionExpression: "Housebill = :Housebill",
        ExpressionAttributeValues: {
          ":Housebill": housebill,
        },
      };

      let shipmentHeaderResponse = await queryDynamo(paramsshipmentHeader);
      console.log("shipmentHeaderResponse", shipmentHeaderResponse);
      shipmentHeaderResponse =
        shipmentHeaderResponse.Items.length > 0
          ? shipmentHeaderResponse.Items[0]
          : {};

      const PK_OrderNo =
        shipmentHeaderResponse?.PK_OrderNo?.length > 0
          ? shipmentHeaderResponse.PK_OrderNo
          : null;

      console.log("PK_OrderNo", PK_OrderNo);

      if (!PK_OrderNo) {
        console.log("PK_OrderNo no not found", paramsshipmentHeader);
        eventLogObj = {
          ...eventLogObj,
          errorMsg: "PK_OrderNo no not found",
          api_status_code: "400",
        };
        console.log("eventLogObj", eventLogObj);
        await putItem(eventLogObj);
        return callback(response("[400]", "file number not found"));
      }
      eventLogObj.PK_OrderNo = PK_OrderNo;

      //  using PK_OrderNo and FK_VendorId (in shipment-header table), to query shipment-apar table and find the FK_ServiceId.

      const paramsShipmentApar = {
        TableName: process.env.SHIPMENT_APAR_TABLE,
        KeyConditionExpression: "FK_OrderNo = :PK_OrderNo",
        FilterExpression: "FK_VendorId = :VendorId",
        ExpressionAttributeValues: {
          ":PK_OrderNo": PK_OrderNo,
          ":VendorId": process.env.IVIA_VENDOR_ID,
        },
      };
      let shipmentAparRes = await queryDynamo(paramsShipmentApar);

      shipmentAparRes =
        shipmentAparRes.Items.length > 0 ? shipmentAparRes.Items[0] : {};
      console.log("shipmentAparRes", shipmentAparRes);

      const FK_ServiceId =
        shipmentAparRes?.FK_ServiceId?.length > 0
          ? shipmentAparRes.FK_ServiceId
          : null;

      console.log("FK_ServiceId", FK_ServiceId);

      if (!FK_ServiceId) {
        console.log("FK_ServiceId Is Empty");
        eventLogObj = {
          ...eventLogObj,
          errorMsg: "FK_ServiceId Is Empty",
          api_status_code: "400",
        };

        console.log("eventLogObj", eventLogObj);

        await putItem(eventLogObj);

        return callback(response("[400]", "FK_ServiceId is empty")); // todo: check with will
      }

      eventLogObj.FK_ServiceId = FK_ServiceId;

      //  using PK_OrderNo query address-mapping table and find the
      //  cc_con_zip //HS or TL,
      // cc_con_address //HS or TL,
      // cc_conname //HS or TL,
      // csh_con_zip //MT,
      // csh_con_address //MT,
      // cc_con_google_match //HS or TL,
      // csh_con_google_match //MT

      const paramsAddMap = {
        TableName: process.env.ADDRESS_MAPPING_TABLE,
        KeyConditionExpression: "FK_OrderNo = :fkNumber",
        ExpressionAttributeValues: {
          ":fkNumber": PK_OrderNo,
        },
      };

      let addressMappingResponse = await queryDynamo(paramsAddMap);

      console.log("addressMappingResponse", addressMappingResponse);
      if (addressMappingResponse.Items.length > 0) {
        addressMappingResponse = addressMappingResponse.Items[0];
      } else {
        console.log("No data found on address mapping table", paramsAddMap);
        eventLogObj = {
          ...eventLogObj,
          errorMsg: "No data found on address mapping table",
          api_status_code: "400",
        };
        console.log("eventLogObj", eventLogObj);
        await putItem(eventLogObj);
        return callback(
          response("[400]", "No data found on address mapping table")
        );
      }
      eventLogObj.addressMapObj = addressMappingResponse;

      const conIsCu = consigneeIsCustomer(addressMappingResponse, FK_ServiceId);

      //if customer is consignee then setting the housebill in the validator obj else ignoring the event

      if (conIsCu || shipmentAparRes.ConsolNo === "0") {
        eventLogObj.consigneeIsCustomer = "1";
        validated.housebill = housebill;
      } else {
        console.log("igored response");
        eventLogObj = {
          ...eventLogObj,
          errorMsg: "igored response",
          api_status_code: "400",
        };
        console.log("eventLogObj", eventLogObj);
        await putItem(eventLogObj);
        return callback(response("[400]", "igored response")); //TODO: check with will
      }
    }
  }

  /**
   * checking docType inside the event and seting the doctype in the validator obj
   */
  if (
    "docType" in eventBody.documentUploadRequest &&
    eventBody.documentUploadRequest.docType != ""
  ) {
    if (eventBody.documentUploadRequest.docType.toString().length <= 10) {
      validated.docType = eventBody.documentUploadRequest.docType;
      docType = eventBody.documentUploadRequest.docType;
    } else {
      validated.docType = eventBody.documentUploadRequest.docType
        .toString()
        .slice(0, 10);
      docType = eventBody.documentUploadRequest.docType.toString().slice(0, 10);
    }
  }

  /**
   * checking content type
   * if content type present then setting the fileExtenction
   * else checking the content type depending on the starting of b64str string
   * and setting the extensiton values according to this match "/9j/4" =.jpeg, iVBOR=png, R0lG=gif, J=pdf, TU0AK or SUkqA = tiff
   * if no extensiton then throwing error
   */

  if (!fileExtension) {
    if (
      "contentType" in eventBody.documentUploadRequest &&
      eventBody.documentUploadRequest.contentType.split("/").length >= 2 &&
      eventBody.documentUploadRequest.contentType.split("/")[1] != ""
    ) {
      fileExtension = "." + eventBody.documentUploadRequest.contentType.split("/")[1];
    } else if (eventBody.documentUploadRequest.b64str.startsWith("/9j/4")) {
      fileExtension = ".jpeg";
    } else if (eventBody.documentUploadRequest.b64str.startsWith("iVBOR")) {
      fileExtension = ".png";
    } else if (eventBody.documentUploadRequest.b64str.startsWith("R0lG")) {
      fileExtension = ".gif";
    } else if (eventBody.documentUploadRequest.b64str.startsWith("J")) {
      fileExtension = ".pdf";
    } else if (
      eventBody.documentUploadRequest.b64str.startsWith("TU0AK") ||
      eventBody.documentUploadRequest.b64str.startsWith("SUkqA")
    ) {
      fileExtension = ".tiff";
    } else {
      fileExtension = "";
    }
  }
  if (fileExtension == "") {
    eventLogObj = {
      ...eventLogObj,
      errorMsg:
        "Unable to identify filetype. Please send content type with file extension.",
      api_status_code: "400",
    };
    console.log("eventLogObj", eventLogObj);
    await putItem(eventLogObj);
    return callback(
      response(
        "[400]",
        "Unable to identify filetype. Please send content type with file extension."
      )
    );
  }
  let formatDate =
    currentDateTime.getFullYear().toString() +
    pad2(currentDateTime.getMonth() + 1) +
    pad2(currentDateTime.getDate()) +
    pad2(currentDateTime.getHours()) +
    pad2(currentDateTime.getMinutes()) +
    pad2(currentDateTime.getSeconds());

  let fileName;
  if (fileNumber != "") {
    fileName = fileNumber + "_" + docType + "_" + formatDate + fileExtension;
  } else {
    fileName = docType + "_" + formatDate + fileExtension;
  }
  validated.filename = fileName;
  console.log("fileName:", fileName);
  try {
    const postData = makeJsonToXml(validated);
    console.info("postData", postData);
    const res = await getXmlResponse(postData);
    console.info("resp: ", res);
    const dataObj = makeXmlToJson(res.xml_response);
    eventLogObj.response_json = JSON.stringify(
      dataObj["soap:Envelope"]["soap:Body"].AttachFileToShipmentResponse
    );
    if (
      dataObj["soap:Envelope"]["soap:Body"].AttachFileToShipmentResponse
        .AttachFileToShipmentResult.Success == "true"
    ) {
      eventLogObj.api_status_code = "200";
      console.log("eventLogObj", eventLogObj);
      await putItem(eventLogObj);
      return { documentUploadResponse: { message: "success" } };
    } else {
      console.log("Returned XML After Conversion: ", dataObj);

      eventLogObj = {
        ...eventLogObj,
        errorMsg: JSON.stringify(
          dataObj["soap:Envelope"]["soap:Body"].AttachFileToShipmentResponse
            .AttachFileToShipmentResult.ErrorStatus
        ),
        api_status_code: "400",
      };
      console.log("eventLogObj", eventLogObj);
      await putItem(eventLogObj);
      return callback(
        response(
          "[400]",
          dataObj["soap:Envelope"]["soap:Body"].AttachFileToShipmentResponse
            .AttachFileToShipmentResult.ErrorStatus
        )
      );
    }
  } catch (error) {
    eventLogObj.api_status_code = "500";
    eventLogObj = {
      ...eventLogObj,
      errorMsg: JSON.stringify(error.message),
      api_status_code: "500",
    };
    console.log("eventLogObj", eventLogObj);
    await putItem(eventLogObj);
    return callback(
      response("[500]", {
        documentUploadResponse: {
          message: "failed",
          error: error.hasOwnProperty("message") ? error.message : error,
        },
      })
    );
  }
};

/**
 * send the xml payload to the UPLOAD_DOCUMENT_API and receive a xml response
 * @param {*} postData
 * @returns
 */
async function getXmlResponse(postData) {
  let res;
  try {
    res = await axios.post(process.env.UPLOAD_DOCUMENT_API, postData, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "application/soap+xml; charset=utf-8",
      },
    });
    console.log("XML Response: Axios", res);
    eventLogObj.response_xml = JSON.stringify(res.data);
    eventLogObj.wt_status_code = JSON.stringify(res.status);

    return {
      xml_response: res.data,
      status_code: res.status,
      status: res.status == 200 ? "success" : "failed",
    };
  } catch (e) {
    console.log("XML Response Error: ", e);
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}
/**
 * convert a json file to xml
 * @param {*} data
 * @returns
 */
function makeJsonToXml(data) {
  try {
    return convert({
      "soap:Envelope": {
        "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
        "@xmlns:soap": "http://www.w3.org/2003/05/soap-envelope",
        "soap:Body": {
          AttachFileToShipment: {
            "@xmlns": "http://tempuri.org/",
            Housebill: data.housebill,
            FileDataBase64: data.b64str,
            Filename: data.filename,
            DocType: data.docType,
          },
        },
      },
    });
  } catch (e) {
    console.log("JSON to XML error: ", e);
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}

/**
 * convert a xml file to json
 * @param {'*'} data
 * @returns
 */
function makeXmlToJson(data) {
  try {
    return convert(data, { format: "object" });
  } catch (e) {
    console.log("XML to JSON error: ", e);
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}

/**
 * return the response message
 * @param {*} code
 * @param {*} message
 * @returns
 */
function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}

function pad2(n) {
  return n < 10 ? "0" + n : n;
}

/**
 *  query omni-dw-customer-entitlement-dev table depending on the CustomerId and HouseBillNumber
 * @param {*} housebill
 * @param {*} customerId
 * @returns
 */
async function getFileNumber(housebill, customerId) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.HOUSEBILL_TABLE,
      IndexName: process.env.HOUSEBILL_TABLE_INDEX,
      KeyConditionExpression:
        "CustomerID = :CustomerID AND HouseBillNumber = :Housebill",
      ExpressionAttributeValues: {
        ":Housebill": housebill,
        ":CustomerID": customerId,
      },
    };
    const response = await documentClient.query(params).promise();
    if (response.Items && response.Items.length > 0) {
      console.info("Get FileNumber Dynamo resp: ", response.Items);
      return response.Items[0];
    } else {
      return "failure";
    }
  } catch (e) {
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}

/**
 *  query omni-dw-customer-entitlement-dev table depending on the CustomerId and FileNumber
 * @param {*} filenumber
 * @param {*} customerId
 * @returns
 */
async function getHousebillNumber(filenumber, customerId) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.HOUSEBILL_TABLE,
      IndexName: process.env.FILENUMBER_TABLE_INDEX,
      KeyConditionExpression:
        "CustomerID = :CustomerID AND FileNumber = :FileNumber",
      ExpressionAttributeValues: {
        ":FileNumber": filenumber,
        ":CustomerID": customerId,
      },
    };
    const response = await documentClient.query(params).promise();
    if (response.Items && response.Items.length > 0) {
      console.info("GetHousebill Dynamo resp: ", response.Items);
      return response.Items[0];
    } else {
      return "failure";
    }
  } catch (e) {
    throw e.hasOwnProperty("message") ? e.message : e;
  }
}

//-------------------
// query dynamodb tables
async function queryDynamo(params) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const response = await documentClient.query(params).promise();
    return response;
  } catch (error) {
    console.log("error", error);
    return { Items: [] };
  }
}

//put the eventLogObj into the "omni-add-document-logs-dev" dynamodb
async function putItem(item) {
  const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: process.env.REGION,
  });

  let params;
  try {
    params = {
      TableName: process.env.ADD_DOCUMENT_LOG_TABLE,
      Item: item,
    };
    console.log("Inserted");
    await dynamodb.put(params).promise();
  } catch (e) {
    console.error("Put Item Error: ", e, "\nPut params: ", params);
  }
}

/**
 * checking the FK_ServiceId is HS, TL or MT from the omni-wt-address-mapping-dev table
 * is consignee the customer check
 * If the FK_ServiceId = 'HS' or 'TL', checking for the zip codes match and address match from consignee table and confirmation_cost table. i,e. in the address-mapping dynamodb table cc_con_zip and cc_con_address has to be "1".
 * If the FK_ServiceId = 'MT', checking for the zip codes match and address match from consignee table and consol_stop_headers table. i,e. in the address-mapping dynamodb table csh_con_address and csh_con_zip has to be "1".
 * If zip codes and address dose not match then checnk google address i.e. address-mapping(omni-wt-address-mapping-dev) dynamodb table cc_con_google_match and csh_con_google_match has to be "1"
 * @param {*} addressMapRes
 * @param {*} FK_ServiceId
 * @returns
 */
function consigneeIsCustomer(addressMapRes, FK_ServiceId) {
  let check = 0;
  if (["HS", "TL"].includes(FK_ServiceId)) {
    check =
      addressMapRes.cc_con_zip === "1" &&
        (addressMapRes.cc_con_address === "1" ||
          addressMapRes.cc_con_google_match === "1")
        ? true
        : false;
  } else if (FK_ServiceId === "MT") {
    check =
      addressMapRes.csh_con_zip === "1" &&
        (addressMapRes.csh_con_address === "1" ||
          addressMapRes.csh_con_google_match === "1")
        ? true
        : false;
  }
  return check;
}

async function convertImageToPDF(imageBuffer) {
  return new Promise((resolve, reject) => {
    const pdfBuffer = [];
    const dimensions = sizeOf(imageBuffer);
    const doc = new pdfkit({ size: [get(dimensions,"width"), get(dimensions,"height")] });
    doc.on('data', chunk => pdfBuffer.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(pdfBuffer)));

    // Determine the image type and add it to the PDF
    const imageType = get(dimensions,"type").toLowerCase();
    if (imageType === 'jpeg' || imageType === 'jpg') {
      doc.image(imageBuffer, 0, 0, {
        width: get(dimensions,"width"),
        height: get(dimensions,"height")
      });
    } else if (imageType === 'png') {
      const png = PNG.sync.read(imageBuffer);
      const pngBuffer = PNG.sync.write(png);
      doc.image(pngBuffer, 0, 0, {
        width: get(dimensions,"width"),
        height: get(dimensions,"height")
      });
    } else {
      reject(new Error('Unsupported image type'));
    }

    doc.end();
  });
}

function detectMimeType(b64) {
  const signatures = {
    'iVBORw0KGgo': 'image/png',
    '/9j/': 'image/jpg',
  };
  for (const s in signatures) {
    if (b64.indexOf(s) === 0) {
      return signatures[s];
    }
  }
}
