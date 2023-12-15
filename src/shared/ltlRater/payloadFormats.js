const { get, unset } = require("lodash");
const xml2js = require("xml2js");
const moment = require("moment");
const { zips } = require("./zipCode.js");
const { accessorialMappingRDFS, accessorialMappingXPOL, accessorialMappingSAIA, accessorialMappingPENS, accessorialMappingSEFN, accessorialMappingDAFG, pieceTypeMappingABFS, accessorialMappingFEXF, freightClassFEXF, pieceTypeMappingEXLA, unitMapping, accessorialMappingODFL, accessorialMappingEXLA, accessorialMappingFWDA } = require("./helper.js");

const xmlPayloadFormat = {
    FWDA: {
        FAQuoteRequest: {
            BillToCustomerNumber: 2353722,
            Origin: {
                OriginZipCode: "",
                Pickup: {
                    AirportPickup: "N",
                },
            },
            Destination: {
                DestinationZipCode: "",
                Delivery: {
                    AirportDelivery: "N",
                },
            },
            FreightDetails: {
                FreightDetail: [],
            },

            Dimensions: {
                Dimension: [],
            },
            Hazmat: "N",
            InBondShipment: "N",
            DeclaredValue: 0,
            ShippingDate: "",
        },
    },
    EXLA: {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/", //NOSONAR
                "xmlns:rat": "http://ws.estesexpress.com/ratequote", //NOSONAR
                "xmlns:rat1": "http://ws.estesexpress.com/schema/2019/01/ratequote", //NOSONAR
            },
            "soapenv:Header": {
                "rat:auth": {
                    "rat:user": "omni2",
                    "rat:password": "OmniAllin1", //NOSONAR
                },
            },
            "soapenv:Body": {
                "rat1:rateRequest": {
                    "rat1:requestID": "test",
                    "rat1:account": "",
                    "rat1:originPoint": {
                        "rat1:countryCode": "",
                        "rat1:postalCode": "",
                    },
                    "rat1:destinationPoint": {
                        "rat1:countryCode": "",
                        "rat1:postalCode": "",
                    },
                    "rat1:payor": "T",
                    "rat1:terms": "PPD",
                    "rat1:pickup": {
                        "rat1:date": "",
                        "rat1:ready": "",
                    },
                    "rat1:declaredValue": 0,
                    "rat1:fullCommodities": { "rat1:commodity": [] },
                },
            },
        },
    },
    ODFL: {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/", //NOSONAR
                "xmlns:myr": "http://myRate.ws.odfl.com/", //NOSONAR
            },
            "soapenv:Header": "",
            "soapenv:Body": {
                "myr:getLTLRateEstimate": {
                    arg0: {
                        destinationPostalCode: "",
                        freightItems: {
                            height: "",
                            width: "",
                            numberOfUnits: "",
                            ratedClass: "",
                            weight: "",
                        },
                        insuranceAmount: 0,
                        odfl4MeUser: "OmniDFW",
                        odfl4MePassword: "Omnidfw1!",
                        odflCustomerAccount: "",
                        originPostalCode: "",
                        pickupDateTime: "",
                        requestReferenceNumber: 1,
                        shipType: "LTL",
                        tariff: "559",
                    },
                },
            },
        },
    },
    FEXF: {
        accountNumber: {
            value: "",
        },
        rateRequestControlParameters: {
            returnTransitTimes: "",
            servicesNeededOnRateFailure: "",
            rateSortOrder: "",
        },
        freightRequestedShipment: {
            shipper: {
                address: {
                    city: "",
                    stateOrProvinceCode: "",
                    postalCode: "",
                    countryCode: "",
                    residential: "",
                },
            },
            recipient: {
                address: {
                    city: "San Francisco",
                    stateOrProvinceCode: "",
                    postalCode: "",
                    countryCode: "",
                    residential: "",
                },
            },

            shippingChargesPayment: {
                payor: {
                    responsibleParty: {
                        address: {
                            city: "HOUSTON",
                            stateOrProvinceCode: "",
                            postalCode: "",
                            countryCode: "",
                            residential: "",
                        },
                        accountNumber: {
                            value: "",
                        },
                    },
                },
            },
            rateRequestType: [],
            shipDateStamp: "",
            requestedPackageLineItems: [],
            totalPackageCount: "",
            totalWeight: "",
            freightShipmentDetail: {
                role: "",
                accountNumber: {
                    value: "",
                },
                shipmentDimensions: {
                    length: "",
                    width: "",
                    height: "",
                    units: "",
                },
                lineItem: [],
                fedExFreightBillingContactAndAddress: {
                    address: {
                        city: "",
                        stateOrProvinceCode: "",
                        postalCode: "",
                        countryCode: "",
                    },
                    accountNumber: {
                        value: "",
                    },
                },
                alternateBillingParty: {
                    address: {
                        city: "",
                        stateOrProvinceCode: "",
                        postalCode: "",
                        countryCode: "",
                    },
                    accountNumber: {
                        value: "",
                    },
                },
            },
        },
    },
    ABFS: {
        ID: "99YGF074",
        TPBAFF: "Y",
        TPBPay: "Y",
        TPBZip: "",
        ShipZip: "",
        ConsZip: "",
        DeclaredValue: "",
        Acc_ELC: "",
        DeclaredType: "",
        ShipMonth: "",
        ShipDay: "",
        ShipYear: "",
        FrtHght1: "",
        FrtLng1: "",
        FrtWdth1: "",
        FrtLWHType: "",
        UnitNo1: "",
        UnitType1: "",
        Class1: "",
        Wgt1: "",
        Acc_HAZ: "N",
        Acc_IPU: "N",
        Acc_RPU: "N",
        Acc_GRD_PU: "N",
        Acc_IDEL: "N",
        Acc_RDEL: "N",
        Acc_GRD_DEL: "N",
    },
    AVRT: {
        accountNumber: "",
        customerType: "",
        paymentType: "",
        originZip: "",
        originCity: "",
        originState: "",
        destinationZip: "",
        destinationCity: "",
        destinationState: "",
        additionalCargoLiability: "",
        shipDate: "",
        numPieces: "",
        cubicFeet: "",
        shipmentInfo: {
            items: [],
        },
    },
    DAFG: {
        account: "",
        destination: "",
        handlingUnits: [],
        items: [],
        origin: "",
        shipmentDate: "",
        terms: "",
    },
    SEFN: {
        Username: "",
        Password: "",
        CustomerAccount: "",
        returnX: "",
        rateXML: "",
        Option: "",
        PickupDateMM: "",
        PickupDateDD: "",
        PickupDateYYYY: "",
        Terms: "",
        OriginZip: "",
        OrigCountry: "",
        DestinationZip: "",
        DestCountry: "",
        NumberOfUnits1: "",
        Weight1: "",
        DimsOption: "",
        PieceLength1: "",
        PieceWidth1: "",
        PieceHeight1: "",
        UnitOfMeasure1: "",
        chkHM: "",
        Class1: "",
        chkIP: "",
        chkPR: "",
        chkLGP: "",
        chkID: "",
        chkLGD: "",
    },
    PENS: {
        "soap12:Envelope": {
            $: {
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance", //NOSONAR
                "xmlns:xsd": "http://www.w3.org/2001/XMLSchema", //NOSONAR
                "xmlns:soap12": "http://www.w3.org/2003/05/soap-envelope", //NOSONAR
            },
            "soap12:Body": {
                CreatePensRateQuote: {
                    $: { xmlns: "http://peninsulatruck.com/WebServices" }, //NOSONAR
                    userId: "",
                    password: "",
                    account: "",
                    customerType: "",
                    nonePalletizedMode: "",
                    originZip: "",
                    destinationZip: "",
                    classList: "",
                    weightList: "",
                    pltCountList: "",
                    pltLengthList: "",
                    pltWidthList: "",
                },
            },
        },
    },
    SAIA: {
        "soap:Envelope": {
            $: {
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance", //NOSONAR
                "xmlns:xsd": "http://www.w3.org/2001/XMLSchema", //NOSONAR
                "xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/", //NOSONAR
            },
            "soap:Body": {
                Create: {
                    $: {
                        xmlns: "http://www.saiasecure.com/WebService/ratequote/", //NOSONAR
                    },
                    request: {
                        Details: {
                            DetailItem: {
                                Weight: "",
                                Class: "",
                            },
                        },
                        Dimensions: {
                            DimensionItem: {
                                Length: "",
                                Width: "",
                                Height: "",
                                Units: "",
                            },
                        },
                        UserID: "",
                        Password: "",
                        TestMode: "",
                        BillingTerms: "",
                        AccountNumber: "",
                        Application: "",
                        OriginZipcode: "",
                        DestinationCity: "",
                        DestinationState: "",
                        DestinationZipcode: "",
                        FullValueCoverage: "",
                    },
                },
            },
        },
    },
    XPOL: {
        shipmentInfo: {
            shipmentDate: "",
            shipper: {
                address: {
                    postalCd: "",
                },
            },
            consignee: {
                address: {
                    postalCd: "",
                },
            },
            commodity: [],
            paymentTermCd: "",
            bill2Party: {
                acctInstId: "",
            },
        },
    },
    RDFS: {
        "soap:Envelope": {
            $: {
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance", //NOSONAR
                "xmlns:xsd": "http://www.w3.org/2001/XMLSchema", //NOSONAR
                "xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/", //NOSONAR
            },
            "soap:Header": {
                AuthenticationHeader: {
                    $: { xmlns: "https://webservices.rrts.com/ratequote/" },
                    UserName: "",
                    Password: "",
                    Site: "",
                },
            },
            "soap:Body": {
                RateQuote: {
                    $: { xmlns: "https://webservices.rrts.com/ratequote/" },
                    request: {
                        ShipDate: "",
                        OriginZip: "",
                        DestinationZip: "",
                        ShipmentDetails: {
                            ShipmentDetail: {
                                ActualClass: "",
                                Weight: "",
                            },
                        },
                        OriginType: "",
                        PaymentType: "",
                        CubicFeet: "",
                        Pieces: "",
                    },
                },
            },
        },
    },
};

function getXmlPayloadFWDA({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList }) {
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["BillToCustomerNumber"] = 2353722;

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Origin"]["OriginZipCode"] = shipperZip;

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Origin"]["Pickup"]["AirportPickup"] = "N";

    if (accessorialList.filter((accessorial) => ["APPT", "INSPU", "RESID", "LIFT"].includes(accessorial)).length > 0) {
        xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Origin"]["Pickup"]["PickupAccessorials"] = { PickupAccessorial: [] };
        for (const accessorial of accessorialList) {
            if (["APPT", "INSPU", "RESID", "LIFT"].includes(accessorial)) {
                xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Origin"]["Pickup"]["PickupAccessorials"]["PickupAccessorial"].push(accessorialMappingFWDA[accessorial]);
            }
        }
    } else {
        unset(xmlPayloadFormat, "FWDA.FAQuoteRequest.Origin.Pickup.PickupAccessorials");
    }

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Destination"]["DestinationZipCode"] = consigneeZip;

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Destination"]["Delivery"]["AirportDelivery"] = "N";

    if (accessorialList.filter((accessorial) => ["APPTD", "INDEL", "RESDE", "LIFTD"].includes(accessorial)).length > 0) {
        xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Destination"]["Delivery"]["DeliveryAccessorials"] = { DeliveryAccessorial: [] };
        for (const accessorial of accessorialList) {
            if (["APPTD", "INDEL", "RESDE", "LIFTD"].includes(accessorial)) {
                xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Destination"]["Delivery"]["DeliveryAccessorials"]["DeliveryAccessorial"].push(accessorialMappingFWDA[accessorial]);
            }
        }
    } else {
        unset(xmlPayloadFormat, "FWDA.FAQuoteRequest.Destination.Delivery.DeliveryAccessorials");
    }

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Hazmat"] = "N";
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["InBondShipment"] = "N";
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["DeclaredValue"] = insuredValue;
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["ShippingDate"] = pickupTime;

    for (let index = 0; index < shipmentLines.length; index++) {
        const shipmentLine = shipmentLines[index];
        xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["FreightDetails"]["FreightDetail"][index] = {
            Weight: get(shipmentLine, "weight"),
            WeightType: unitMapping["FWDA"][get(shipmentLine, "weightUOM")] ?? get(shipmentLine, "weightUOM"),
            Pieces: get(shipmentLine, "pieces"),
            FreightClass: get(shipmentLine, "freightClass"),
        };

        xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Dimensions"]["Dimension"][index] = {
            Pieces: get(shipmentLine, "pieces"),
            Length: get(shipmentLine, "length"),
            Width: get(shipmentLine, "width"),
            Height: get(shipmentLine, "height"),
        };
    }

    const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
    });
    return builder.buildObject(xmlPayloadFormat.FWDA);
}

function getXmlPayloadEXLA({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, reference }) {
    // For ESTES
    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Header"]["rat:auth"]["rat:user"] = "omni2";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Header"]["rat:auth"]["rat:password"] = "OmniAllin1"; //NOSONAR

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:requestID"] = reference;
    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:account"] = "5098931";
    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:originPoint"]["rat1:countryCode"] = "US";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:originPoint"]["rat1:postalCode"] = shipperZip;

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:destinationPoint"]["rat1:countryCode"] = "US";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:destinationPoint"]["rat1:postalCode"] = consigneeZip;

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:payor"] = "T";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:terms"] = "PPD";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:pickup"]["rat1:date"] = pickupTime.split("T")[0];

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:pickup"]["rat1:ready"] = pickupTime.split("T")[1];

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:declaredValue"] = insuredValue;

    if (accessorialList.length > 0 || get(shipmentLines, "[0].hazmat") === true) {
        xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:accessorials"] = { "rat1:accessorialCode": [] };
        for (const accessorial of accessorialList) {
            xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:accessorials"]["rat1:accessorialCode"].push(accessorialMappingEXLA[accessorial]);
        }
        if (get(shipmentLines, "[0].hazmat") === true) {
            xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:accessorials"]["rat1:accessorialCode"].push("HAZ");
        }
    }

    for (let index = 0; index < shipmentLines.length; index++) {
        const shipmentLine = shipmentLines[index];

        xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:fullCommodities"]["rat1:commodity"][index] = {
            "rat1:class": get(shipmentLine, "freightClass"),
            "rat1:weight": get(shipmentLine, "weight"),
            "rat1:pieces": get(shipmentLine, "pieces"),
            "rat1:pieceType": pieceTypeMappingEXLA[get(shipmentLine, "pieceType")],
            "rat1:dimensions": {
                "rat1:length": get(shipmentLine, "length"),
                "rat1:width": get(shipmentLine, "width"),
                "rat1:height": get(shipmentLine, "height"),
            },
        };
    }
    const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
    });
    return builder.buildObject(xmlPayloadFormat.EXLA);
}

function getXmlPayloadFEXF({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, reference }) {
    const shipper = zips[shipperZip];
    const consignee = zips[consigneeZip];

    xmlPayloadFormat["FEXF"]["accountNumber"]["value"] = 226811362;
    xmlPayloadFormat["FEXF"]["rateRequestControlParameters"]["returnTransitTimes"] = true;
    xmlPayloadFormat["FEXF"]["rateRequestControlParameters"]["servicesNeededOnRateFailure"] = true;
    xmlPayloadFormat["FEXF"]["rateRequestControlParameters"]["rateSortOrder"] = "SERVICENAMETRADITIONAL";

    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["shipper"]["address"] = {
        city: get(shipper, "city"),
        stateOrProvinceCode: get(shipper, "state"),
        postalCode: get(shipper, "zip_code"),
        countryCode: "US",
        residential: false,
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["recipient"]["address"] = {
        city: get(consignee, "city"),
        stateOrProvinceCode: get(consignee, "state"),
        postalCode: get(consignee, "zip_code"),
        countryCode: "US",
        residential: false,
    };

    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["shippingChargesPayment"]["payor"]["responsibleParty"]["address"] = {
        city: "HOUSTON",
        stateOrProvinceCode: "TX",
        postalCode: "77032",
        countryCode: "US",
        residential: false,
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["shippingChargesPayment"]["payor"]["responsibleParty"]["accountNumber"]["value"] = 554332390;

    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["rateRequestType"] = ["ACCOUNT"];

    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["shipDateStamp"] = pickupTime.split("T")[0];
    let totalPackageCount = 0;
    let totalWeight = 0;
    for (let index = 0; index < shipmentLines.length; index++) {
        const shipmentLine = shipmentLines[index];
        const pieceType = "BOX";
        const pieces = get(shipmentLine, "pieces");
        const weight = get(shipmentLine, "weight");
        const weightUOM = unitMapping["FEXF"][get(shipmentLine, "weightUOM")];
        const length = get(shipmentLine, "length");
        const width = get(shipmentLine, "width");
        const height = get(shipmentLine, "height");
        const dimUOM = unitMapping["FEXF"][get(shipmentLine, "dimUOM")];
        const hazmat = get(shipmentLine, "hazmat", false);
        const freightClass = get(shipmentLine, "freightClass");
        totalPackageCount += Number(pieces);
        totalWeight += Number(weight);
        const packageLineItem = {
            subPackagingType: pieceType,
            groupPackageCount: pieces,
            declaredValue: {
                amount: insuredValue,
                currency: "USD",
            },
            weight: {
                units: weightUOM,
                value: weight,
            },
            dimensions: {
                length,
                width,
                height,
                units: dimUOM,
            },
            associatedFreightLineItems: [
                {
                    id: index + 1,
                },
            ],
        };
        xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["requestedPackageLineItems"].push(packageLineItem);

        const lineItems = {
            subPackagingType: pieceType,
            weight: {
                units: weightUOM,
                value: weight,
            },
            pieces: pieces,
            freightClass: freightClassFEXF[freightClass],
            id: index + 1,
            hazardousMaterials: hazmat ? "HAZARDOUS_MATERIALS" : hazmat,
            dimensions: {
                length,
                width,
                height,
                units: dimUOM,
            },
        };
        xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentDetail"]["lineItem"].push(lineItems);
    }
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["totalPackageCount"] = totalPackageCount;
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["totalWeight"] = totalWeight;
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentDetail"]["role"] = "SHIPPER";
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentDetail"]["accountNumber"] = { value: "226811362" };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentDetail"]["shipmentDimensions"] = {
        length: get(shipmentLines, "[0].length"),
        width: get(shipmentLines, "[0].width"),
        height: get(shipmentLines, "[0].height"),
        units: unitMapping["FEXF"][get(shipmentLines, "[0].dimUOM")],
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentDetail"]["fedExFreightBillingContactAndAddress"]["address"] = {
        city: "HOUSTON",
        stateOrProvinceCode: "TX",
        postalCode: "77032",
        countryCode: "US",
        residential: false,
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentDetail"]["fedExFreightBillingContactAndAddress"]["accountNumber"] = {
        value: "554332390",
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentDetail"]["alternateBillingParty"]["address"] = {
        city: "HOUSTON",
        stateOrProvinceCode: "TX",
        postalCode: "77032",
        countryCode: "US",
        residential: false,
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentDetail"]["alternateBillingParty"]["accountNumber"] = {
        value: "554332390",
    };
    const hazmat = get(shipmentLines, "[0].hazmat", false);
    if (accessorialList.filter((acc) => Object.keys(accessorialMappingFEXF).includes(acc)).length > 0 || hazmat) {
        xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentSpecialServices"] = { specialServiceTypes: [] };
        xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentSpecialServices"] = { specialServiceTypes: accessorialList.filter((acc) => Object.keys(accessorialMappingFEXF).includes(acc)).map((item) => accessorialMappingFEXF[item]) };
        if (hazmat) xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentSpecialServices"]["specialServiceTypes"].push("DANGEROUS_GOODS");
    }
    return xmlPayloadFormat["FEXF"];
}

function getXmlPayloadODFL({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, reference }) {
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["odfl4MeUser"] = "OmniDFW";
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["odfl4MePassword"] = "Omnidfw1!";
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["odflCustomerAccount"] = "13469717";
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["shipType"] = "LTL";
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["tariff"] = "559";
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["requestReferenceNumber"] = 1;
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["originPostalCode"] = shipperZip;
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["destinationPostalCode"] = consigneeZip;
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["pickupDateTime"] = pickupTime;
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["insuranceAmount"] = insuredValue;
    const shipmentLine = shipmentLines[0];
    if (accessorialList.filter((acc) => Object.keys(accessorialMappingODFL).includes(acc)).length > 0 || get(shipmentLine, "hazmat") === true) {
        xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["accessorials"] = [];
        xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["accessorials"] = accessorialList.filter((acc) => Object.keys(accessorialMappingODFL).includes(acc)).map((item) => accessorialMappingODFL[item]);
        if (get(shipmentLine, "hazmat") === true || get(shipmentLine, "hazmat") === "true") {
            xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["accessorials"].push("HAZ");
        }
    }
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"]["myr:getLTLRateEstimate"]["arg0"]["freightItems"] = {
        height: get(shipmentLine, "height"),
        width: get(shipmentLine, "width"),
        length: get(shipmentLine, "length"),
        numberOfUnits: get(shipmentLine, "pieces"),
        ratedClass: get(shipmentLine, "freightClass"),
        weight: get(shipmentLine, "weight"),
    };

    const builder = new xml2js.Builder({
        headless: true,
    });
    return builder.buildObject(xmlPayloadFormat.ODFL);
}

function getXmlPayloadABFS({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList }) {
    xmlPayloadFormat["ABFS"]["ID"] = "99YGF074";
    xmlPayloadFormat["ABFS"]["TPBAFF"] = "Y";
    xmlPayloadFormat["ABFS"]["TPBPay"] = "Y";
    xmlPayloadFormat["ABFS"]["TPBZip"] = "75019";
    xmlPayloadFormat["ABFS"]["ShipZip"] = shipperZip;
    xmlPayloadFormat["ABFS"]["ConsZip"] = consigneeZip;
    xmlPayloadFormat["ABFS"]["DeclaredValue"] = insuredValue;
    xmlPayloadFormat["ABFS"]["Acc_ELC"] = "Y";
    xmlPayloadFormat["ABFS"]["DeclaredType"] = "N";
    if (!insuredValue || insuredValue === 0) {
        delete xmlPayloadFormat["ABFS"]["DeclaredValue"];
        delete xmlPayloadFormat["ABFS"]["Acc_ELC"];
        delete xmlPayloadFormat["ABFS"]["DeclaredType"];
    }
    xmlPayloadFormat["ABFS"]["ShipMonth"] = moment(new Date(pickupTime)).get("month") + 1;
    xmlPayloadFormat["ABFS"]["ShipDay"] = moment(new Date(pickupTime)).get("date");
    xmlPayloadFormat["ABFS"]["ShipYear"] = moment(new Date(pickupTime)).get("year");
    const shipmentLine = shipmentLines[0];
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const height = get(shipmentLine, "height");
    const dimUOM = unitMapping["ABFS"][get(shipmentLine, "dimUOM")];
    const hazmat = get(shipmentLine, "hazmat", false);
    const freightClass = get(shipmentLine, "freightClass");
    const pieces = get(shipmentLine, "pieces");
    const pieceType = pieceTypeMappingABFS[get(shipmentLine, "pieceType")];
    const weight = get(shipmentLine, "weight");
    xmlPayloadFormat["ABFS"]["FrtHght1"] = height;
    xmlPayloadFormat["ABFS"]["FrtLng1"] = length;
    xmlPayloadFormat["ABFS"]["FrtWdth1"] = width;
    xmlPayloadFormat["ABFS"]["FrtLWHType"] = dimUOM;
    xmlPayloadFormat["ABFS"]["UnitNo1"] = pieces;
    xmlPayloadFormat["ABFS"]["UnitType1"] = pieceType;
    xmlPayloadFormat["ABFS"]["Class1"] = freightClass;
    xmlPayloadFormat["ABFS"]["Wgt1"] = weight;
    xmlPayloadFormat["ABFS"]["Acc_HAZ"] = hazmat ? "Y" : "N";
    setAccessorialForABFS(accessorialList);
    return xmlPayloadFormat["ABFS"];
}

function setAccessorialForABFS(accessorialList) {
    accessorialList.map((item) => {
        if (item === "INSPU") {
            xmlPayloadFormat["ABFS"]["Acc_IPU"] = "Y";
            return;
        }
        if (item === "RESID") {
            xmlPayloadFormat["ABFS"]["Acc_RPU"] = "Y";
            return;
        }
        if (item === "LIFT") {
            xmlPayloadFormat["ABFS"]["Acc_GRD_PU"] = "Y";
            return;
        }
        if (item === "INDEL") {
            xmlPayloadFormat["ABFS"]["Acc_IDEL"] = "Y";
            return;
        }
        if (item === "RESDE") {
            xmlPayloadFormat["ABFS"]["Acc_RDEL"] = "Y";
            return;
        }
        if (item === "LIFTD") {
            xmlPayloadFormat["ABFS"]["Acc_GRD_DEL"] = "Y";
            return;
        }
    });
}

function getXmlPayloadAVRT({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList }) {
    const shipperDetails = zips[shipperZip];
    const destinationDetails = zips[consigneeZip];
    xmlPayloadFormat["AVRT"]["accountNumber"] = "0834627";
    xmlPayloadFormat["AVRT"]["customerType"] = "Third Party";
    xmlPayloadFormat["AVRT"]["paymentType"] = "Prepaid";
    xmlPayloadFormat["AVRT"]["originZip"] = get(shipperDetails, "zip_code") + "";
    xmlPayloadFormat["AVRT"]["originCity"] = get(shipperDetails, "city");
    xmlPayloadFormat["AVRT"]["originState"] = get(shipperDetails, "state");
    xmlPayloadFormat["AVRT"]["destinationZip"] = get(destinationDetails, "zip_code") + "";
    xmlPayloadFormat["AVRT"]["destinationCity"] = get(destinationDetails, "city");
    xmlPayloadFormat["AVRT"]["destinationState"] = get(destinationDetails, "state");
    xmlPayloadFormat["AVRT"]["additionalCargoLiability"] = insuredValue;
    xmlPayloadFormat["AVRT"]["shipDate"] = pickupTime.split("T")[0];
    const shipmentLine = shipmentLines[0];
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const height = get(shipmentLine, "height");
    const cubicFeet = (length * width * height) / Math.pow(12, 3);
    xmlPayloadFormat["AVRT"]["numPieces"] = get(shipmentLine, "pieces");
    xmlPayloadFormat["AVRT"]["cubicFeet"] = cubicFeet;
    xmlPayloadFormat["AVRT"]["shipmentInfo"]["items"].push({
        shipmentClass: get(shipmentLine, "freightClass"),
        shipmentWeight: get(shipmentLine, "weight"),
    });
    if (accessorialList.filter((acc) => ["LIFT", "LIFTD", "INDEL", "RESDE"].includes(acc)).length > 0 || get(shipmentLine, "hazmat")) xmlPayloadFormat["AVRT"]["shipmentInfo"]["accessorials"] = {};
    if (get(shipmentLine, "hazmat")) xmlPayloadFormat["AVRT"]["shipmentInfo"]["accessorials"]["hazmat"] = true;
    accessorialList.forEach((acc) => {
        if (["LIFT", "LIFTD"].includes(acc)) xmlPayloadFormat["AVRT"]["shipmentInfo"]["accessorials"]["liftgate"] = true;
        if (acc === "INDEL") xmlPayloadFormat["AVRT"]["shipmentInfo"]["accessorials"]["insideDelivery"] = true;
        if (acc === "RESDE") xmlPayloadFormat["AVRT"]["shipmentInfo"]["accessorials"]["residentialDelivery"] = true;
    });

    return xmlPayloadFormat["AVRT"];
}

function getXmlPayloadDAFG({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList }) {
    xmlPayloadFormat["DAFG"]["account"] = "AE11312";
    xmlPayloadFormat["DAFG"]["destination"] = consigneeZip;
    xmlPayloadFormat["DAFG"]["origin"] = shipperZip;
    xmlPayloadFormat["DAFG"]["shipmentDate"] = pickupTime;
    xmlPayloadFormat["DAFG"]["terms"] = "ThirdPartyPrepaid";
    const shipmentLine = shipmentLines[0];
    const height = get(shipmentLine, "height");
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const weight = get(shipmentLine, "weight");
    const hazmat = get(shipmentLine, "hazmat", false);
    const pieces = get(shipmentLine, "pieces");
    const freightClass = get(shipmentLine, "freightClass");

    xmlPayloadFormat["DAFG"]["handlingUnits"].push({
        height,
        length,
        quantity: pieces,
        width,
        stackable: false,
    });

    xmlPayloadFormat["DAFG"]["items"].push({
        class: freightClass,
        weight,
    });
    if (accessorialList.filter((acc) => Object.keys(accessorialMappingDAFG).includes(acc)).length > 0 || hazmat) {
        xmlPayloadFormat["DAFG"]["accessorials"] = [];
        xmlPayloadFormat["DAFG"]["accessorials"] = accessorialList.filter((acc) => Object.keys(accessorialMappingDAFG).includes(acc)).map((item) => accessorialMappingDAFG[item]);
        if (hazmat) xmlPayloadFormat["DAFG"]["accessorials"].push("HMF");
    }

    return xmlPayloadFormat["DAFG"];
}

function getXmlPayloadSEFN({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList }) {
    xmlPayloadFormat["SEFN"]["Username"] = "OMNILOG";
    xmlPayloadFormat["SEFN"]["Password"] = "OMN474";
    xmlPayloadFormat["SEFN"]["CustomerAccount"] = 999840398;
    xmlPayloadFormat["SEFN"]["returnX"] = "Y";
    xmlPayloadFormat["SEFN"]["rateXML"] = "Y";
    xmlPayloadFormat["SEFN"]["Option"] = "T";
    xmlPayloadFormat["SEFN"]["PickupDateMM"] = moment(new Date(pickupTime)).get("month") + 1;
    xmlPayloadFormat["SEFN"]["PickupDateDD"] = moment(new Date(pickupTime)).get("date");
    xmlPayloadFormat["SEFN"]["PickupDateYYYY"] = moment(new Date(pickupTime)).get("year");
    xmlPayloadFormat["SEFN"]["Terms"] = "P";
    xmlPayloadFormat["SEFN"]["OriginZip"] = shipperZip;
    xmlPayloadFormat["SEFN"]["OrigCountry"] = "U";
    xmlPayloadFormat["SEFN"]["DestinationZip"] = consigneeZip;
    xmlPayloadFormat["SEFN"]["DestCountry"] = "U";
    const shipmentLine = shipmentLines[0];
    const height = get(shipmentLine, "height");
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const weight = get(shipmentLine, "weight");
    const hazmat = get(shipmentLine, "hazmat", false);
    const pieces = get(shipmentLine, "pieces");
    const freightClass = get(shipmentLine, "freightClass");
    const dimUOM = unitMapping["SEFN"][get(shipmentLine, "dimUOM")];
    xmlPayloadFormat["SEFN"]["NumberOfUnits1"] = pieces;
    xmlPayloadFormat["SEFN"]["Weight1"] = weight;
    xmlPayloadFormat["SEFN"]["DimsOption"] = "I";
    xmlPayloadFormat["SEFN"]["PieceLength1"] = length;
    xmlPayloadFormat["SEFN"]["PieceWidth1"] = width;
    xmlPayloadFormat["SEFN"]["PieceHeight1"] = height;
    xmlPayloadFormat["SEFN"]["UnitOfMeasure1"] = dimUOM;
    if (hazmat) {
        xmlPayloadFormat["SEFN"]["chkHM"] = "on";
    } else {
        xmlPayloadFormat["SEFN"]["chkHM"] = "off";
    }
    xmlPayloadFormat["SEFN"]["Class1"] = freightClass;

    accessorialList
        .filter((acc) => Object.keys(accessorialMappingSEFN).includes(acc))
        .map((item) => {
            if (item === "INSPU") {
                xmlPayloadFormat["SEFN"]["chkIP"] = "on";
            }
            if (item === "RESID") {
                xmlPayloadFormat["SEFN"]["chkPR"] = "on";
            }
            if (item === "LIFT") {
                xmlPayloadFormat["SEFN"]["chkLGP"] = "on";
            }
            if (item === "INDEL") {
                xmlPayloadFormat["SEFN"]["chkID"] = "on";
            }
            if (item === "RESDE") {
                xmlPayloadFormat["SEFN"]["chkPR"] = "on";
            }
            if (item === "LIFTD") {
                xmlPayloadFormat["SEFN"]["chkLGD"] = "on";
            }
        });

    return xmlPayloadFormat["SEFN"];
}

function getXmlPayloadPENS({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList }) {
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["userId"] = "OMNI";
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["password"] = "OMNI123"; //NOSONAR
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["account"] = "820504";
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["customerType"] = "B";
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["nonePalletizedMode"] = "";
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["originZip"] = shipperZip;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["destinationZip"] = consigneeZip;
    const shipmentLine = shipmentLines[0];
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const weight = get(shipmentLine, "weight");
    const hazmat = get(shipmentLine, "hazmat", false);
    const pieces = get(shipmentLine, "pieces");
    const freightClass = get(shipmentLine, "freightClass");
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["classList"] = freightClass;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["weightList"] = weight;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["pltCountList"] = pieces;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["pltLengthList"] = length;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["pltWidthList"] = width;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["accessorialList"] = [];
    if (accessorialList.filter((acc) => Object.keys(accessorialMappingPENS).includes(acc)).length > 0) {
        xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["accessorialList"] = accessorialList.filter((acc) => Object.keys(accessorialMappingPENS).includes(acc)).map((item) => accessorialMappingPENS[item]);
    }
    if (hazmat) xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["accessorialList"].push("SP1HA");
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["accessorialList"].push(`FV${insuredValue}`);
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["accessorialList"] = xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"]["CreatePensRateQuote"]["accessorialList"].join(",");
    const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
    });
    return builder.buildObject(xmlPayloadFormat["PENS"]);
}

function getXmlPayloadSAIA({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList }) {
    const destination = zips[consigneeZip];
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["UserID"] = "callcenter";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["Password"] = "omni921";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["TestMode"] = "N";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["BillingTerms"] = "Prepaid";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["AccountNumber"] = "0698518";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["Application"] = "ThirdParty";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["OriginZipcode"] = shipperZip;
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["DestinationCity"] = get(destination, "city");
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["DestinationState"] = get(destination, "state");
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["DestinationZipcode"] = consigneeZip;
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["FullValueCoverage"] = insuredValue;

    const shipmentLine = shipmentLines[0];
    const height = get(shipmentLine, "height");
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const weight = get(shipmentLine, "weight");
    const hazmat = get(shipmentLine, "hazmat", false);
    const pieces = get(shipmentLine, "pieces");
    const freightClass = get(shipmentLine, "freightClass");
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["Details"]["DetailItem"] = {
        Weight: weight,
        Class: freightClass,
    };
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["Dimensions"]["DimensionItem"] = {
        Height: height,
        Length: length,
        Units: pieces,
        Width: width,
    };
    const newAccessorialList = accessorialList.filter((acc) => !["APPT"].includes(acc));
    console.info(`🙂 -> file: ltl_rating.js:1749 -> newAccessorialList:`, newAccessorialList);
    if (newAccessorialList.length > 0 || hazmat) {
        xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["Accessorials"] = { AccessorialItem: [] };
        xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["Accessorials"]["AccessorialItem"] = newAccessorialList.filter((acc) => Object.keys(accessorialMappingSAIA).includes(acc)).map((item) => ({ Code: accessorialMappingSAIA[item] }));
        if (hazmat) xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"]["Accessorials"]["AccessorialItem"].push({ Code: "Hazardous" });
    }

    const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
    });
    return builder.buildObject(xmlPayloadFormat["SAIA"]);
}

function getXmlPayloadXPOL({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList }) {
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["shipmentDate"] = pickupTime;
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["shipper"]["address"]["postalCd"] = shipperZip;
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["consignee"]["address"]["postalCd"] = consigneeZip;
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["paymentTermCd"] = "P";
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["bill2Party"]["acctInstId"] = "70250271";

    xmlPayloadFormat["XPOL"]["shipmentInfo"]["commodity"] = shipmentLines.map((shipmentLine) => {
        const height = get(shipmentLine, "height");
        const length = get(shipmentLine, "length");
        const width = get(shipmentLine, "width");
        const weight = get(shipmentLine, "weight");
        const hazmat = get(shipmentLine, "hazmat", false);
        const pieces = get(shipmentLine, "pieces");
        const weightUom = get(shipmentLine, "weightUOM");
        const dimUOM = get(shipmentLine, "dimUOM");
        const freightClass = get(shipmentLine, "freightClass");

        return {
            pieceCnt: pieces,
            grossWeight: {
                weight: weight,
                weightUom: get(unitMapping["XPOL"], weightUom, "lbs"),
            },
            dimensions: {
                length: length,
                width: width,
                height: height,
                dimensionsUom: get(unitMapping["XPOL"], dimUOM, "INCH"),
            },
            hazmatInd: hazmat,
            nmfcClass: freightClass,
        };
    });
    const hazmat0 = get(shipmentLines, "[0].hazmat", false);
    if (accessorialList.filter((acc) => Object.keys(accessorialMappingXPOL).includes(acc)).length > 0 || hazmat0) {
        xmlPayloadFormat["XPOL"]["shipmentInfo"]["accessorials"] = [];
        xmlPayloadFormat["XPOL"]["shipmentInfo"]["accessorials"] = [...new Set(accessorialList.filter((acc) => Object.keys(accessorialMappingXPOL).includes(acc)).map((item) => accessorialMappingXPOL[item]))].map((item2) => ({
            accessorialCd: item2,
        }));

        if (hazmat0)
            xmlPayloadFormat["XPOL"]["shipmentInfo"]["accessorials"].push({
                accessorialCd: "ZHM",
            });
    }

    return xmlPayloadFormat["XPOL"];
}

function getXmlPayloadRDFS({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList }) {
    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Header"]["AuthenticationHeader"]["UserName"] = "omlog";
    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Header"]["AuthenticationHeader"]["Password"] = "AllinRoad#1";

    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["ShipDate"] = pickupTime.split("T")[0];
    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["OriginZip"] = shipperZip;
    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["DestinationZip"] = consigneeZip;

    const shipmentLine = shipmentLines[0];
    const height = get(shipmentLine, "height");
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const weight = get(shipmentLine, "weight");
    const hazmat = get(shipmentLine, "hazmat", false);
    const pieces = get(shipmentLine, "pieces");
    const freightClass = get(shipmentLine, "freightClass");
    const cubicFeet = parseInt((length * width * height) / Math.pow(12, 3));

    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["ShipmentDetails"]["ShipmentDetail"]["ActualClass"] = freightClass;
    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["ShipmentDetails"]["ShipmentDetail"]["Weight"] = weight;
    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["OriginType"] = "B";
    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["PaymentType"] = "P";
    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["CubicFeet"] = cubicFeet;
    xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["Pieces"] = pieces;
    if (accessorialList.filter((acc) => Object.keys(accessorialMappingRDFS).includes(acc)).length > 0 || hazmat) {
        xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["ServiceDeliveryOptions"] = { ServiceOptions: [] };
        xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["ServiceDeliveryOptions"]["ServiceOptions"] = [...new Set(accessorialList.filter((acc) => Object.keys(accessorialMappingRDFS).includes(acc)).map((item) => accessorialMappingRDFS[item]))].map((item2) => ({
            ServiceCode: item2,
        }));

        if (hazmat)
            xmlPayloadFormat["RDFS"]["soap:Envelope"]["soap:Body"]["RateQuote"]["request"]["ServiceDeliveryOptions"]["ServiceOptions"].push({
                ServiceCode: "HAZ",
            });
    }

    const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
    });
    return builder.buildObject(xmlPayloadFormat.RDFS);
}

module.exports = { xmlPayloadFormat, getXmlPayloadFWDA, getXmlPayloadEXLA, getXmlPayloadFEXF, getXmlPayloadODFL, getXmlPayloadABFS, getXmlPayloadAVRT, getXmlPayloadDAFG, getXmlPayloadSEFN, getXmlPayloadPENS, getXmlPayloadSAIA, getXmlPayloadXPOL, getXmlPayloadRDFS };
