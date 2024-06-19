/*
* File: src\shared\utils\pagination.js
* Project: Omni-datawarehouse-api-services
* Author: Bizcloud Experts
* Date: 2022-08-02
* Confidential and Proprietary
*/
async function createPagination(response, responseArrayName, host, path, page, size, totalCount, selfPageLink) {
  let currentPageResult
  let lastPageLink = "N/A";
  let nextPageLink = "N/A";
  let previousPageLink = "N/A";
  let resp = {}
  const hostPath = host + path

  const result = new Array(Math.ceil(response.length / (size)))
    .fill()
    .map(_ => response.splice(0, (size)))
  currentPageResult = result[page - 1]
  const previousPageArray = result[page - 2]
  const lastPageArray = result[(result.length) - 2]

  if (!(currentPageResult.length < size) && result[page] != undefined) {
    nextPageLink = hostPath + "page=" + (Number(page) + 1) + "&size=" + size
  }

  if (lastPageArray) {
    lastPageLink = hostPath + "page=" + result.length + "&size=" +
      size
  }

  if (previousPageArray) {
    previousPageLink = hostPath + "page=" + (page - 1) + "&size=" +
      size
  }

  resp[responseArrayName] = currentPageResult;
  page = parseInt(page);
  resp["Page"] = {
    'Size': currentPageResult.length,
    'TotalElement': totalCount,
    'TotalPages': Math.ceil(totalCount / (size)),
    'Number': page
  };
  let firstLink = hostPath + "page=1" + "&size=" + size

  resp["_links"] = {
    "self": {
      "href": hostPath + selfPageLink
    },
    "first": {
      "href": firstLink
    },
    "last": {
      "href": lastPageLink
    },
    "next": {
      "href": nextPageLink
    },
    "previous": {
      "href": previousPageLink
    }
  };
  return resp;
}

module.exports = {
  createPagination
};