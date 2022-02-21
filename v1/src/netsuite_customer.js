const AWS = require("aws-sdk");
const pgp = require("pg-promise");
const NetSuite = require("node-suitetalk");
const Configuration = NetSuite.Configuration;
const Service = NetSuite.Service;
const Search = NetSuite.Search;

const userConfig = {
  account: "1238234_SB1",
  apiVersion: "2021_2",
  accountSpecificUrl: true,
  token: {
    consumer_key:
      "cc2b4d76232dbcb49f8678aa968b2c61989683ac8b094db962dc7a56a099768f",
    consumer_secret:
      "5620fcb78dd156f28ac2a9804d3f2d06df3f957297b6b8a9e6a1aaa13f55362b",
    token_key:
      "7a9da21f09bd1ff3911a4699a923ba37a424ad7c9ebf1d44906dfcfdcdbe483e",
    token_secret:
      "6a159f86931aa2ae894bdc7abcc9055f48f254af8ee41cad7e86fd21ba07d5e3",
  },
  wsdlPath:
    "https://1238234-sb1.restlets.api.netsuite.com/wsdl/v2021_2_0/netsuite.wsdl",
};

let totalCountPerLoop = 700;

module.exports.handler = async (event, context, callback) => {
  let hasMoreData = "false";
  let currentCount = 0;
  totalCountPerLoop = event.hasOwnProperty("totalCountPerLoop")
    ? event.totalCountPerLoop
    : totalCountPerLoop;

  try {
    /**
     * Get connections
     */
    const connections = getConnection();

    /**
     * Get data from db
     */
    const customerList = await getCustomerData(connections);
    console.log("customerList", customerList.length, customerList);
    currentCount = customerList.length;
    // return {};

    for (let i = 0; i < customerList.length; i++) {
      const customer_id = customerList[i].customer_id;
      try {
        /**
         * get customer from netsuit
         */
        const customerData = await getcustomer(customer_id);
        console.log("customerData", customerData);

        await putCustomer(connections, customerData, customer_id);
        console.log("count", i + 1);
      } catch (error) {}
    }

    if (currentCount > totalCountPerLoop) {
      hasMoreData = "true";
    } else {
      hasMoreData = "false";
    }
    return { hasMoreData };
  } catch (error) {
    return { hasMoreData: false };
  }
};

function getConnection() {
  try {
    const dbUser = process.env.USER;
    const dbPassword = process.env.PASS;
    // const dbHost = process.env.HOST;
    const dbHost = "omni-dw-prod.cnimhrgrtodg.us-east-1.redshift.amazonaws.com";
    const dbPort = process.env.PORT;
    const dbName = process.env.DBNAME;

    const dbc = pgp({ capSQL: true });
    const connectionString = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
    console.log("connectionString", connectionString);
    return dbc(connectionString);
  } catch (error) {
    throw "DB Connection Error";
  }
}

async function getCustomerData(connections) {
  try {
    const query = `SELECT distinct customer_id FROM interface_ar where customer_internal_id is null 
                    limit ${totalCountPerLoop + 1}`;

    const result = await connections.query(query);
    if (!result || result.length == 0) {
      throw "No data found.";
    }
    return result;
  } catch (error) {
    throw "No data found.";
  }
}

async function putCustomer(connections, customerData, customer_id) {
  try {
    // const query = `INSERT INTO netsuit_customer
    //               (entityId, entityInternalId, currency, currencyInternalId)
    //               VALUES ('${customerData.entityId}', '${customerData.entityInternalId}',
    //                       '${customerData.currency}', '${customerData.currencyInternalId}')`;
    const query = `UPDATE interface_ar SET 
                    customer_internal_id = '${customerData.entityInternalId}', 
                    currency_internal_id = '${customerData.currencyInternalId}' 
                    WHERE customer_id = '${customer_id}' `;
    await connections.query(query);
  } catch (error) {
    console.log("error**", error);
    throw "No data found.";
  }
}

function getcustomer(entityId) {
  return new Promise((resolve, reject) => {
    const config = new Configuration(userConfig);
    const service = new Service(config);
    service
      .init()
      .then((/**/) => {
        // Set search preferences
        const searchPreferences = new Search.SearchPreferences();
        searchPreferences.pageSize = 5;
        service.setSearchPreferences(searchPreferences);

        // Create basic search
        const search = new Search.Basic.CustomerSearchBasic();

        const nameStringField = new Search.Fields.SearchStringField();
        nameStringField.field = "entityId";
        nameStringField.operator = "is";
        nameStringField.searchValue = entityId; //"COMSP27";

        search.searchFields.push(nameStringField);

        return service.search(search);
      })
      .then((result, raw, soapHeader) => {
        // console.log(JSON.stringify(result));
        if (result && result?.searchResult?.recordList?.record.length > 0) {
          const record = result.searchResult.recordList.record[0];
          resolve({
            entityId: record.entityId,
            entityInternalId: record["$attributes"].internalId,
            currency: record.currency.name,
            currencyInternalId: record.currency["$attributes"].internalId,
          });
        } else {
          reject({ customError: true, msg: "Customer not found" });
        }
      })
      .catch((err) => {
        reject({ customError: true, msg: "Customer Api failed" });
      });
  });
}
