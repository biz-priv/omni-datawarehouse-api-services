const {
	SHIPMENT_HEADER_TABLE,
	SHIPMENT_HEADER_TABLE_STREAM_QLQ,
	SNS_TOPIC_ARN,
	SHIPPEO_USERNAME,
	SHIPPEO_PASSWORD,
	SHIPPEO_GET_DOC_URL,
	SHIPPEO_UPLOAD_DOC_URL,
	LOG_TABLE,
	SHIPPEO_GET_TOKEN_URL,
} = process.env;
const { get } = require("lodash");
const axios = require("axios");
const FormData = require("form-data");
const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

module.exports.handler = async (event, context, callback) => {
	try {
		console.info("Event: \n", JSON.stringify(event));
		const records = get(event, "Records", []);

		// Get Token
		const username = SHIPPEO_USERNAME;
		const password = SHIPPEO_PASSWORD;
		const basicAuth = getBasicAuth({ username, password });
		console.log(basicAuth);
		const url = SHIPPEO_GET_TOKEN_URL;
		const getTokenRes = await getToken({ url, token: basicAuth });
		const token = get(getTokenRes, "data.token");
		let body;
		await Promise.all(
			records.map(async (record) => {
				console.log(SHIPMENT_HEADER_TABLE);
				body = JSON.parse(get(record, "body", ""));
				const FK_OrderNo = get(body, "Item.PK_OrderNo", "");
				const houseBillNo = get(body, "Item.Housebill", "");
				const validHouseBillNo = await getIfHouseBillNumberValid({
					FK_OrderNo,
				});
				console.log(
					"🚀 ~ file: shippeo_pod_upload_doc.js:30 ~ records.map ~ validHouseBillNop:",
					validHouseBillNo
				);

				if (!validHouseBillNo) {
					console.log(`${houseBillNo} is not valid.`);
					return;
				}

				const getDocUrl = `${SHIPPEO_GET_DOC_URL}?docType=HOUSEBILL,LABEL&housebill=${houseBillNo}`;
				const xApiKey = "fIZpXhfGKQ42h6zIs7EUetiJd9yiAui7LlZxbkFh";
				const getDocumentRes = await getDocument({ url: getDocUrl, xApiKey });
				const docs = get(getDocumentRes, "getDocumentResponse.documents", []);

				const uploadToUrl = `${SHIPPEO_UPLOAD_DOC_URL}/${houseBillNo}/files`;
				await uploadDocs({ docs, uploadToUrl, token });
				console.log(
					"🚀 ~ file: shippeo_pod_upload_doc.js:24 ~ module.exports.handler= ~ docs:",
					docs
				);
			})
		);
	} catch (error) {
		console.error("Error : \n", error);
		try {
			const params = {
				Subject: "Error on shippeo-pod-upload-doc lambda",
				Message: `EDI alert reports Error in omni,\n lambda :shippeo-pod-upload-doc \n ERROR: ${error}`, // The message you want to send
				TopicArn: SNS_TOPIC_ARN, // The ARN (Amazon Resource Name) of your SNS topic
			};
			const data = await sns.publish(params).promise();
			console.log("Error notification Message sent:", data.MessageId);

			const queueUrl = SHIPMENT_HEADER_TABLE_STREAM_QLQ;
			const queueMessage = {
				QueueUrl: queueUrl,
				MessageBody: JSON.stringify(body),
			};
			console.log(
				"🚀 ~ file: shipment_header_table_stream_processor.js:31 ~ event.Records.forEach ~ queueMessage:",
				queueMessage
			);
			await sqs.sendMessage(queueMessage).promise();
		} catch (err) {
			console.log("Error while sending error notification message:", err);
		}
		return callback(null, { statusCode: 500, body: JSON.stringify(error) });
	}
};

const getBasicAuth = ({ username, password }) => {
	const credentials = `${username}:${password}`;
	// Encode the credentials using base64
	const base64Credentials = Buffer.from(credentials).toString("base64");
	return `Basic ${base64Credentials}`;
};

const getToken = async ({ url, token }) => {
	const { data } = await axios.post(
		url,
		{},
		{
			headers: {
				"Content-Type": "application/json",
				Authorization: token,
			},
		}
	);
	return data;
};

const getDocument = async ({ url, xApiKey }) => {
	const { data } = await axios.get(url, {
		headers: {
			"Content-Type": "application/json",
			"x-api-key": xApiKey,
		},
	});
	return data;
};

const uploadDocs = async ({ docs, uploadToUrl, token }) => {
	const formData = new FormData();
	docs.forEach(async (doc) => {
		const { data: fileContent } = await axios.get(get(doc, "url"), {
			responseType: "arraybuffer",
		});
		formData.append("attachments", fileContent, {
			filename: get(doc, "filename"),
		});
	});

	const { data } = await axios.post(uploadToUrl, formData, {
		headers: {
			...formData.getHeaders(),
			maxBodyLength: Infinity,
			Authorization: `Bearer ${token}`,
		},
	});
	console.log(
		"🚀 ~ file: shippeo_pod_upload_doc.js:89 ~ uploadDocs ~ data:",
		data
	);
};

const getIfHouseBillNumberValid = async ({ FK_OrderNo }) => {
	const getFileDataParams = {
		TableName: process.env.SHIPMENT_FILE_TABLE,
		KeyConditionExpression: "FK_OrderNo  = :FK_OrderNo ",
		FilterExpression:
			"(FK_DocType = :FK_DocType1 OR FK_DocType = :FK_DocType2) AND CustomerAccess = :CustomerAccess",
		ExpressionAttributeValues: {
			":FK_OrderNo ": FK_OrderNo,
			":FK_DocType1": "HCPOD",
			":FK_DocType2": "POD",
			":CustomerAccess": "Y",
		},
	};
	console.log(
		"🚀 ~ file: shippeo_pod_upload_doc.js:109 ~ getHouseBillNumber ~ getFileDataParams:",
		getFileDataParams
	);
	const result = await dynamoDB.query(getFileDataParams).promise();
	console.log(
		"🚀 ~ file: shippeo_pod_upload_doc.js:125 ~ getIfHouseBillNumberValid ~ result:",
		result
	);
	return get(result, "Items", []).length > 0;
};
