package com.serverless;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
// import org.json.simple.parser.ParseException;

// public class Handler implements RequestHandler<Map<String, Object>, ApiGatewayResponse> {

// 	private static final Logger LOG = LogManager.getLogger(Handler.class);

// 	@Override
// 	public ApiGatewayResponse handleRequest(Map<String, Object> input, Context context) {
// 		LOG.info("received: {}", input);
// 		Response responseBody = new Response("Go Serverless v1.x! Your function executed successfully!", input);
// 		return ApiGatewayResponse.builder()
// 				.setStatusCode(200)
// 				.setObjectBody(responseBody)
// 				.setHeaders(Collections.singletonMap("X-Powered-By", "AWS Lambda & serverless"))
// 				.build();
// 	}
// }

public class Handler
		implements RequestHandler<Map<String, Object>, Map<String, Object>> {
	private static final Logger LOG = LogManager.getLogger(Handler.class);

	public Map<String, Object> handleRequest(Map<String, Object> input, Context context) {
		try {
			LOG.info("received: {}", input);
			// String command = "java -jar /opt/java/lib/CallHdssViaCognito.jar";
			String filename = (String) input.get("filename");
			String base64 = (String) input.get("base64");
			// Use the values
			LOG.info("filename: {}", filename);
			LOG.info("base64: {}", base64);

			String filePath = "/tmp/" + filename;

			String command = "ls -a /tmp";

			byte[] decodedBytes = Base64.getDecoder().decode(base64);
			File file = new File(filePath);

			try (FileOutputStream fos = new FileOutputStream(file)) {
				fos.write(decodedBytes);
			}

			// Create a ProcessBuilder
			ProcessBuilder processBuilder = new ProcessBuilder(command.split(" "));
			processBuilder.redirectErrorStream(true);

			// Start the process
			Process process = processBuilder.start();

			// Read the output of the external JAR
			BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
			StringBuilder output = new StringBuilder();
			String line;
			while ((line = reader.readLine()) != null) {
				output.append(line).append("\n");
			}

			// Wait for the process to complete
			int exitCode = process.waitFor();

			if (exitCode == 0) {
				Map<String, Object> response = new HashMap<>();
				response.put("status", "SUCCESS");
				response.put("data", output.toString());
				return response;
			} else {
				Map<String, Object> response = new HashMap<>();
				response.put("status", "FAILED");
				response.put("data", output.toString());
				return response;
			}

		} catch (Exception e) {
			LOG.error("Error parsing JSON: {}", e.getMessage());
			Map<String, Object> response = new HashMap<>();
			response.put("error", e.getMessage());
			response.put("status", "FAILED");

			return response;
		}
	}
}