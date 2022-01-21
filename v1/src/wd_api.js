const AWS = require("aws-sdk");
const axios = require("axios");
const { convert } = require("xmlbuilder2");
const pgp = require("pg-promise");
const wd_payload = require("../../Helpers/wd_payload.json");
const wd_pdf = require("../../Helpers/wd_pdf.json");

module.exports.handler = async (event, context, callback) => {
  try {
    /**
     * Get data from db
     */
    const shipmentData = await getDataFromDB();
    console.info("Total shipment data count", shipmentData.length);
    /**
     * Check ETA shipment data process
     */
    await Promise.all(
      shipmentData.map(async (item) => {
        try {
          const newData = await checkStatus(item);
          let itemData = newData.data;
          let is_update = newData.is_update;

          /**
           * Make Json to Xml payload
           */
          const xmlPayload = await makeJsonToXml(
            Object.assign({}, wd_payload),
            itemData
          );

          /**
           * Get response from WD api
           */
          const xmlResponse = await getXmlResponse(xmlPayload);

          /**
           * make Xml to Json response
           */
          const refTransmissionNo = makeXmlToJson(xmlResponse);

          /**
           * Update shipment data to dynamo db
           */
          await updateStatus(
            itemData,
            xmlPayload,
            xmlResponse,
            refTransmissionNo,
            is_update
          );
        } catch (error) {
          console.info("item info:", error);
          console.info("item info:", item);
        }
      })
    );

    return "Completed";
  } catch (error) {
    return callback(
      response(
        "[500]",
        error != null && error.hasOwnProperty("message") ? error.message : error
      )
    );
  }
};

async function getDataFromDB(data = null) {
  try {
    // const dbUser = process.env.USER;
    // const dbPassword = process.env.PASS;
    // const dbHost = process.env.HOST_URL;
    // const dbPort = process.env.PORT;
    // const dbName = process.env.WD_DBNAME;

    const dbUser = process.env.USER;
    const dbPassword = process.env.PASS;
    // const dbHost = process.env.HOST_URL;
    const dbHost = "omni-dw-prod.cnimhrgrtodg.us-east-1.redshift.amazonaws.com";
    const dbPort = process.env.PORT;
    const dbName = process.env.WD_DBNAME;

    const dbc = pgp({ capSQL: true });
    const connectionString = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
    console.log("connectionString", connectionString);
    const connections = dbc(connectionString);
    const query = `select distinct
    a.file_nbr ,a.house_bill_nbr ,
    a.handling_stn ,a.controlling_stn ,a.chrg_wght_lbs ,a.chrg_wght_kgs ,pieces,
    case b.order_status
    when 'PUP' then 'AF'
    when 'COB' then 'AN'
    when 'DEL'then 'D1'
    when 'OSD' then 'A9'
    when 'REF' then 'A7'
    else order_Status
    end order_Status,
    case b.order_status
    when 'PUP' then 'Pick Up Confirmed'
    when 'COB' then 'Confirmed On Board'
    when 'DEL'then 'Delivered - No Exception'
    when 'REF'then 'Delivery - Refused'
    when 'OSD'then 'Delivered - With Exception'
    else order_Status_desc
    end order_Status_Desc,
    case when b.order_status in ('PUP','COB','DEL','REF','OSD') then b.event_date_utc else null end as Event_Date_utc,
    case when b.order_status in ('PUP','COB') then A.ORIGIN_PORT_IATA
    when b.order_status in ('DEL','REF','OSD') then A.DESTINATION_PORT_IATA
    else '' end as event_city,
    case when b.order_status in ('PUP','COB','DEL') then  'US' else '' end as Event_country,
    c.ref_nbr
        from
        shipment_info a
        left outer join shipment_milestone b
        on a.file_nbr = b.file_nbr
        and a.source_system = b.source_system
        left outer join
        (select distinct source_system ,file_nbr ,ref_nbr from shipment_ref where ref_typeid = 'REF') c
        on a.source_system = c.source_system
        and a.file_nbr = c.file_nbr
        where a.bill_to_nbr = '17833'
        and b.order_status in ('PUP','COB','DEL','POD','OSD','REF')
        and c.ref_nbr <> ''
        union
    select distinct
      a.file_nbr ,a.house_bill_nbr ,
      a.handling_stn ,a.controlling_stn ,a.chrg_wght_lbs ,a.chrg_wght_kgs ,pieces,
      'AG' order_Status,
      'ETA for final delivery' order_Status_desc,
      eta_date as Event_Date_utc,
      A.DESTINATION_PORT_IATA as event_city,
      'US' as Event_country,
      c.ref_nbr
          from
          shipment_info a
          left outer join
          (select distinct source_system ,file_nbr ,ref_nbr from shipment_ref where ref_typeid = 'REF') c
          on a.source_system = c.source_system
          and a.file_nbr = c.file_nbr
          where a.bill_to_nbr = '17833'
          and c.ref_nbr is not null`;

    const result = await connections.query(query);

    if (result && Array.isArray(result) && result.length > 0) {
      const validatedData = result.filter((e) => validateRefNbr(e.ref_nbr));
      if (validatedData.length > 0) {
        return validatedData;
      }
    }
    throw "No data found.";
  } catch (error) {
    throw "No data found.";
  }
}

async function checkStatus(data) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });

    /**
     * check if AG exists.
     */
    const params = {
      TableName: process.env.WD_SHIPMENT_STATUS_TABLE,
      FilterExpression:
        "#file_nbr = :file_nbr AND #order_status = :order_status",
      ExpressionAttributeNames: {
        "#file_nbr": "file_nbr",
        "#order_status": "order_status",
      },
      ExpressionAttributeValues: {
        ":file_nbr": data.file_nbr.toString(),
        ":order_status": data.order_status,
      },
    };
    const res = await documentClient.scan(params).promise();

    //check data exists.
    if (res && res.Count && res.Count == 1) {
      if (data.order_status != "AG" && data.order_status != "AH") {
        throw "No new data";
      }
      /**
       * check if event_date_utc not same
       */
      if (
        res.Items[0].event_date_utc !=
        new Date(data.event_date_utc).toLocaleString()
      ) {
        /**
         * check if AH exists
         */
        const paramsAh = {
          TableName: process.env.WD_SHIPMENT_STATUS_TABLE,
          FilterExpression:
            "#file_nbr = :file_nbr AND #order_status = :order_status",
          ExpressionAttributeNames: {
            "#file_nbr": "file_nbr",
            "#order_status": "order_status",
          },
          ExpressionAttributeValues: {
            ":file_nbr": data.file_nbr.toString(),
            ":order_status": "AH",
          },
        };
        const resAh = await documentClient.scan(paramsAh).promise();
        //if AH exists
        if (resAh && resAh.Count && resAh.Count == 1) {
          //check if AH event date not same
          if (
            resAh.Items[0].event_date_utc !=
            new Date(data.event_date_utc).toLocaleString()
          ) {
            //update AH
            return { data: { ...data, order_status: "AH" }, is_update: true };
          } else {
            throw "No new AH data";
          }
        } else {
          //Insert AH
          return { data: { ...data, order_status: "AH" }, is_update: false };
        }
      } else {
        throw "No new data";
      }
    } else {
      return { data, is_update: false };
    }
  } catch (e) {
    throw e;
  }
}

async function makeJsonToXml(payload, inputData) {
  try {
    /**
     * set auth details
     */
    payload["soapenv:Envelope"]["soapenv:Header"]["wsse:Security"][
      "wsse:UsernameToken"
    ]["wsse:Username"] = process.env.WD_API_USERNAME;
    payload["soapenv:Envelope"]["soapenv:Header"]["wsse:Security"][
      "wsse:UsernameToken"
    ]["wsse:Password"]["#"] = process.env.WD_API_PASSWORD;

    /**
     * TransmissionHeader
     */
    let transHeader =
      payload["soapenv:Envelope"]["soapenv:Body"]["tran:publish"][
        "otm:Transmission"
      ]["otm:TransmissionHeader"];
    /**
     * TransmissionBody values
     */

    let transBodyWithValues = null;

    // PUP => BOL
    // POD => POD

    if (inputData.order_status != "PUP" && inputData.order_status != "POD") {
      /**
       * without pdf
       */
      let transBody =
        payload["soapenv:Envelope"]["soapenv:Body"]["tran:publish"][
          "otm:Transmission"
        ]["otm:TransmissionBody"]["otm:GLogXMLElement"]["otm:ShipmentStatus"];
      transBody["otm:IntSavedQuery"]["otm:IntSavedQueryArg"][0][
        "otm:ArgValue"
      ] = inputData.ref_nbr;

      transBody["otm:IntSavedQuery"]["otm:IntSavedQueryArg"][1][
        "otm:ArgValue"
      ] = inputData.house_bill_nbr;

      transBody["otm:ShipmentRefnum"][0]["otm:ShipmentRefnumValue"] =
        "H" + inputData.ref_nbr;
      transBody["otm:ShipmentRefnum"][1]["otm:ShipmentRefnumValue"] =
        inputData.chrg_wght_kgs;

      transBody["otm:ShipmentRefnum"][2]["otm:ShipmentRefnumValue"] =
        inputData.pieces;
      transBody["otm:WeightVolume"]["otm:Weight"]["otm:WeightValue"] =
        inputData.chrg_wght_kgs;

      transBody["otm:EventDt"]["otm:GLogDate"] = formatDate(
        inputData.event_date_utc
      );

      transBody["otm:SSStop"]["otm:SSLocation"]["otm:EventCity"] =
        inputData.event_city;
      transBody["otm:SSStop"]["otm:SSLocation"]["otm:EventCountry"] =
        inputData.event_country;

      transBody["otm:TrackingNumber"] = "H" + inputData.ref_nbr;

      transBody["otm:ShipmentGid"]["otm:Gid"]["otm:Xid"] = inputData.ref_nbr;

      transBodyWithValues = { "otm:ShipmentStatus": null };
      transBodyWithValues["otm:ShipmentStatus"] = transBody;
    } else {
      /**
       * with pdf
       */
      wd_pdf["otm:Document"]["otm:DocumentDefinitionGid"]["otm:Gid"][
        "otm:Xid"
      ] =
        inputData.order_status == "POD"
          ? "PROOF_OF_DELIVERY"
          : "BILL_OF_LADING";

      wd_pdf["otm:Document"]["otm:DocumentOwner"]["otm:ObjectGid"]["otm:Gid"][
        "otm:Xid"
      ] = inputData.house_bill_nbr;

      /**
       * get base64 pdf
       */
      const base64Pdf = await getBase64Pdf(
        inputData.file_nbr,
        inputData.order_status
      );
      wd_pdf["otm:Document"]["otm:DocumentContent"]["otm:DocContentBinary"] =
        base64Pdf;

      transBodyWithValues = wd_pdf;
    }

    /**
     * set the header and body data
     */
    payload["soapenv:Envelope"]["soapenv:Body"]["tran:publish"][
      "otm:Transmission"
    ]["otm:TransmissionHeader"] = transHeader;

    payload["soapenv:Envelope"]["soapenv:Body"]["tran:publish"][
      "otm:Transmission"
    ]["otm:TransmissionBody"]["otm:GLogXMLElement"] = transBodyWithValues;
    return convert(payload);
  } catch (error) {
    throw error;
  }
}

async function getXmlResponse(postData) {
  try {
    const res = await axios.post(process.env.WD_API, postData, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
    return {
      xml_response: res.data,
      status_code: res.status,
      status: res.status == 200 ? "success" : "failed",
    };
  } catch (e) {}
}

function makeXmlToJson(xmlResponse) {
  try {
    const obj = convert(xmlResponse.xml_response, { format: "object" });
    return obj["S:Envelope"]["S:Body"]["publishResponse"][
      "otm:TransmissionAck"
    ]["otm:EchoedTransmissionHeader"]["otm:TransmissionHeader"][
      "otm:ReferenceTransmissionNo"
    ];
  } catch (error) {
    return null;
  }
}

async function updateStatus(
  record,
  xmlPayload,
  xmlResponse,
  refTransmissionNo,
  is_update = false
) {
  let documentClient = new AWS.DynamoDB.DocumentClient({
    region: process.env.DEFAULT_AWS,
  });
  const data = {
    ...record,
    id: record.file_nbr.toString() + record.order_status,
    ReferenceTransmissionNo: refTransmissionNo,
    xml_payload: xmlPayload,
    ...xmlResponse,
    status:
      refTransmissionNo == -1 || refTransmissionNo == null
        ? "failed"
        : xmlResponse.status,
    event_date_utc: new Date(record.event_date_utc).toLocaleString(),
    created_at: new Date().toLocaleString(),
  };

  try {
    if (is_update) {
      const paramsDT = {
        TableName: process.env.WD_SHIPMENT_STATUS_TABLE,
        Key: {
          id: data.file_nbr.toString() + data.order_status,
          file_nbr: data.file_nbr.toString(),
        },
      };
      await documentClient.delete(paramsDT).promise();
    }

    const params = {
      TableName: process.env.WD_SHIPMENT_STATUS_TABLE,
      Item: data,
    };
    await documentClient.put(params).promise();
  } catch (e) {}
}

async function getBase64Pdf(file_nbr, type) {
  try {
    const pdfApi =
      type == "POD"
        ? process.env.WD_PDF_POD_API_URL
        : process.env.WD_PDF_BOL_API_URL;

    const res = await axios.get(
      `${pdfApi}/${process.env.WD_PDF_API_KEY}/${file_nbr}`
    );
    if (res?.data?.hawb?.b64str) {
      //BOL
      return res.data.hawb.b64str;
    } else if (res?.data?.hcpod?.b64str) {
      //POD
      return res.data.hcpod.b64str;
    } else {
      throw "No Pdf";
    }
  } catch (e) {
    throw "No Pdf";
  }
}

function formatDate(dateObj) {
  var date = new Date(dateObj);
  return (
    date.getFullYear() +
    ("00" + (date.getMonth() + 1)).slice(-2) +
    ("00" + date.getDate()).slice(-2) +
    ("00" + date.getHours()).slice(-2) +
    ("00" + date.getMinutes()).slice(-2) +
    ("00" + date.getSeconds()).slice(-2)
  );
}

function validateRefNbr(ref_nbr = null) {
  try {
    const split =
      ref_nbr != null
        ? ref_nbr.split("-")
        : (() => {
            throw "error null";
          })();
    const dateStr = parseInt(split[0]);
    const isdate =
      split.length == 2
        ? new Date(dateStr) !== "Invalid Date" && !isNaN(new Date(dateStr))
        : false;
    if (isdate && split[1].length > 4) {
      return true;
    } else {
      throw "error1";
    }
  } catch (error) {
    return false;
  }
}

function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}
