import cheerio from "cheerio";

addEventListener("fetch", (event) => {
	event.respondWith(handleRequest(event.request));
});

function getResponse(content, err) {
	return new Response(JSON.stringify(content), {
		type: "application/json",
		status: err ? 400 : 200,
	});
}

/**
 * Handle incoming requests
 * @param {Request} request
 */
async function handleRequest(request) {

	// Validate the term
	const url = new URL(request.url);
	const searchTerm = url.pathname.replace("/", "");
	if (!searchTerm) {
		return getResponse(
			{
				error: "No word provided",
			},
			true
		);
	}

	// Get its definition
	try {
		const data = await findDefinitions(searchTerm, "en");
		return getResponse(data);
	} catch (error) {
		return getResponse({ error }, true);
	}
}

async function findDefinitions(word) {
	if (encodeURIComponent(word).includes("%20%20")) {
		throw {
			statusCode: 404,
			title: "Word not found",
			message:
				"We couldn't find definitions for the word you were looking for.",
			resolution: "You can try the search again or head to the web instead.",
		};
	}

	const URI = `https://www.lexico.com/en/definition/${word}`;

	const body = await giveBody(URI);

	const $ = cheerio.load(body);

	if (!$(".hwg .hw").first()[0]) {
		throw {
			statusCode: 404,
			title: "Word not found",
			message:
				"We couldn't find definitions for the word you were looking for.",
			resolution: "You can try the search again or head to the web instead.",
		};
	}

	var dictionary = [],
		numberOfentryGroup,
		arrayOfEntryGroup = [],
		grambs = $("section.gramb"),
		entryHead = $(".entryHead.primary_homograph");

	let i,
		j = 0;

	for (i = 0; i < entryHead.length; i++) {
		arrayOfEntryGroup[i] =
			$("#" + entryHead[0].attribs.id + " ~ .gramb").length -
			$("#" + entryHead[i].attribs.id + " ~ .gramb").length;
	}
	arrayOfEntryGroup[i] = $("#" + entryHead[0].attribs.id + " ~ .gramb").length;

	numberOfentryGroup = arrayOfEntryGroup.length - 1;

	for (i = 0; i < numberOfentryGroup; i++) {
		var entry = {},
			word = $(".hwg .hw")[i].childNodes[0].nodeValue,
			phonetic = $(".pronSection.etym .pron .phoneticspelling")[i],
			pronunciation = $(".pronSection.etym .pron .speaker")[i],
			origin = $(".pronSection.etym")
				.eq(i)
				.prev()
				.find(".senseInnerWrapper p")
				.text();

		entry.word = word;

		if (phonetic) {
			entry.phonetic = phonetic.childNodes[0] && phonetic.childNodes[0].data;
		}
		if (pronunciation) {
			entry.pronunciation = $(pronunciation).find("a audio").attr("src");
		}

		origin && (entry.origin = origin);

		entry.meaning = {};

		let start = arrayOfEntryGroup[i],
			end = arrayOfEntryGroup[i + 1];

		for (j = start; j < end; j++) {
			var partofspeech = $(grambs[j]).find(".ps.pos .pos").text();

			$(grambs[j])
				.find(".semb")
				.each(function (j, element) {
					var meaningArray = [];

					$(element)
						.find("> li")
						.each(function (j, element) {
							var newDefinition = {},
								item = $(element).find("> .trg"),
								definition = $(item).find(" > p > .ind").text(),
								example = $(item).find(" > .exg  > .ex > em").first().text(),
								synonymsText = $(item)
									.find(" > .synonyms > .exg  > div")
									.first()
									.text(),
								synonyms = synonymsText
									.split(/,|;/)
									.filter((synonym) => synonym != " " && synonym)
									.map(function (item) {
										return item.trim();
									});

							if (definition.length === 0) {
								definition = $(item).find(".crossReference").first().text();
							}

							if (definition.length > 0) newDefinition.definition = definition;

							if (example.length > 0)
								// Remove line break and extra space
								newDefinition.example = example
									.substring(1, example.length - 1)
									.replace(/(\r\n|\n|\r)/gm, " ")
									.trim();

							if (synonyms.length > 0) newDefinition.synonyms = synonyms;

							meaningArray.push(newDefinition);
						});

					if (partofspeech.length === 0) partofspeech = "crossReference";

					entry.meaning[partofspeech] = meaningArray.slice();
				});
		}
		dictionary.push(entry);
	}

	Object.keys(dictionary).forEach((key) => {
		Array.isArray(dictionary[key]) &&
			!dictionary[key].length &&
			delete dictionary[key];
	});

	return dictionary;
}

async function giveBody(url, options = {}) {
	const body = await fetchData(url);

	try {
		options.cleanBody && (body = cleanBody(body));
	} catch (e) {
		throw {
			statusCode: 500,
			title: "Something Went Wrong.",
			message: "Our servers ran into some problem.",
			resolution: "You can try the search again or head to the web instead.",
		};
	}

	return body;
}

function cleanBody(body) {
	let c = "",
		d = 0,
		e = 0,
		arr = [];

	body = body.split("\n");
	body.shift();
	body = body.join("\n");

	for (c = c ? c : c + body; c; ) {
		d = 1 + c.indexOf(";");

		if (!d) {
			break;
		}

		e = d + parseInt(c, 16);

		arr.push(c.substring(d, e));

		c = c.substring(e);
		d = 0;
	}

	arr = arr.filter((e) => e.indexOf("[") !== 0);

	arr[1] = "<script>";
	arr[arr.length] = "</script>";

	return arr.join("");
}

async function fetchData(url) {
	try {
		const response = await fetch(encodeURI(url), {
			headers: {
				Host: "lexico.com",
			},
		});
		return await response.text();
	} catch (err) {
		throw {
			statusCode: 500,
			title: "Something Went Wrong.",
			message: err.toString(),
			resolution: "You can try the search again or head to the web instead.",
		};
	}
}
