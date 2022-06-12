/*
 * Custom functions added by Lars Giling.
 *
 * This file can be seen as extension to app.js.
 * Existing functions in app.js were altered in varying degrees.
 */

let weight_times = [];
let EMA_times = [];
var notiftimer;
var finalEMAtime = 510;
var infoType = "";
var hroption;

//grabs all weight entries from gamebus database
function getWeight() {
    $.when(readOne("playerID", ["settings"])).done(function(data) {
        if (data != null) {
            playerID = JSON.parse(data);
            console.log("getWeight - player ID:" + playerID);
        }
    });
    $.when(readOne("token", ["settings"])).done(function(token) {
        $.ajax({
            url: config.BASE_URL +
                "/players/" +
                playerID +
                config.ACITIVTY_ENDPOINT +
                "&sort=-date&gds=SCALE", //filter out SCALE entries, retrieve them backwards starting from the latest entry
            type: "GET",
            dataType: "json",
            headers: {
                Authorization: "Bearer " + token,
            },
            //     timeout: 5000,
            success: function(data) {
                console.log("succesfull call to gamebus database!");
                /*
                 * All this ensures that ONLY weight entries that are approved and have a value are used in further processing.
                 */
                if (data.length > 0) {
                    for (i = 0; i < data.length; i++) {
                        for (j = 0; j < data[i].propertyInstances.length; j++) {
                            if (data[i].propertyInstances[j].property.translationKey == "APPROVED_BY_PATIENT" && data[i].propertyInstances[j].value == "yes") {
                                for (k = 0; k < data[i].propertyInstances.length; k++) {
                                    if (data[i].propertyInstances[k].property.translationKey == "WEIGHT" && data[i].propertyInstances[k].value != null) {

                                        var latest_weight = data[i].propertyInstances[k].value;
                                        var latest_weight_id = data[i].id;
                                        var lw_t = new Date(data[i].date);
                                        //translate month names to Dutch, grab other time data from entry
                                        let [lw_month, lw_day, lw_hr, lw_min] = [lw_t.toLocaleString('nl-NL', {
                                            month: 'long'
                                        }), lw_t.getDate(), lw_t.getHours(), String(lw_t.getMinutes()).padStart(2, "0")];
                                        //Save the latest entry in local storage.
                                        update({
                                            key: "last_weight",
                                            value: latest_weight
                                        }, ["settings"]);
                                        update({
                                            key: "last_weight_id",
                                            value: latest_weight_id
                                        }, ["settings"]);
                                        //Display the latest weight entry to the user
                                        document.getElementById("last-weight-value").innerHTML = "Laatst gemeten gewicht: <b>" + latest_weight +
                                            "</b>kg op " + lw_day + " " + lw_month + " om " + lw_hr + ":" + lw_min;
                                        console.log("Last: " + latest_weight +
                                            "kg on " + lw_month + " " + lw_day + " at " + lw_hr + ":" + lw_min);
                                        //only show delete weight button if a weight value is actually displayed
                                        document.getElementById("delete-weight-btn").style.display = "flex";
                                        return;
                                    } else {
                                        //approved entries found, but they miss a weight value
                                        console.log("GetWeight:: Goedgekeurde metingen gevonden maar waarden missen..");
                                        document.getElementById("last-weight-value").innerHTML = "Goedgekeurde metingen gevonden maar waarden missen..";
                                        document.getElementById("delete-weight-btn").style.display = "none";
                                    }
                                }
                            }
                            //no approved values found
                            if (j == data[i].propertyInstances.length - 1) {
                                console.log("GetWeight:: Geen goedgekeurde metingen gevonden..");
                                document.getElementById("last-weight-value").innerHTML = "Geen goedgekeurde metingen gevonden..";
                                document.getElementById("delete-weight-btn").style.display = "none";
                            }
                        }
                    }
                } else {
                    //no values found
                    document.getElementById("last-weight-value").innerHTML = "Geen gewichtswaarden gevonden..";
                    document.getElementById("delete-weight-btn").style.display = "none";
                }
            },
            error: function(e) {
                console.log(e);
                document.getElementById("delete-weight-btn").style.display = "none";
                // where the network connection is lost but the app had already received weights from previous launches
                $.when(readOne("last_weight", ["settings"])).done(function(data) {
                    if (token != null && data != null) {
                        latest_weight = JSON.parse(data);
                        document.getElementById("last-weight-value").innerHTML = "Kon geen verbinding maken met database, laatst bekende waarde: " + latest_weight + "kg.";
                    } else {
                        console.log("error token: " + token + ", data: " + data);
                        document.getElementById("last-weight-value").innerHTML = "Geen verbinding met database..";
                    }
                });
            },
        });
    });
};

//sends a manual weight entry to the gamebus database
function sendWeight() {
        var weight = $("#input-current-weight").val().trim();
        //In Dutch mathematics, a comma is used as decimal seperator. This way Dutch users don't have to adapt but values are consistent in the database.
        weight = weight.replace(",", ".");
        //check if the entry is valid (doesn't contain letters or symbols other than .)
        if (weight != "" && weight != null && weight.match(/^[0-9]*\.?[0-9]*$/)) {
            console.log("sendWeight(): " + weight);
            last_messageval = weight;
            lastmsg_t = new Date().getTime();
            add({
                eventKey: new Date().getTime(),
                eventType: "ntf",
                eventOccuredAt: new Date().getTime(),
                eventData: {
                    action: "ADD"
                },
            }, ["activity"]);
            add({
                eventKey: new Date().getTime(),
                eventType: "gb_activity",
                eventOccuredAt: new Date().getTime(),
                eventData: [{
                    gd_tk: "SCALE",
                    properties: [{
                        propertyTK: "Weight",
                        value: weight
                    }, {
                        propertyTK: "APPROVED_BY_PATIENT", //The entry is automatically approved as it is entered manually
                        value: "yes"
                    }],
                }, ],
            }, ["activity"]);
            document.getElementById("weight-error-msg").innerHTML = "";
            tau.closePopup($("#log-weight-popup"));
        } else {
            //if the entry is invalid, provide feedback to user.
            document.getElementById("weight-error-msg").innerHTML = "Error - ongeldige waarde";
        };
        document.getElementById("input-current-weight").value = "";
    }
    //delete a gamebus entry using the entry ID
function deleteEntry() {
        $.when(readOne("token", ["settings"])).done(function(token) {
            $.ajax({
                url: config.BASE_URL +
                    "/activities/" +
                    sockmsg_id,
                type: "DELETE",
                headers: {
                    Authorization: "Bearer " + token,
                },
                success: function(data) {
                    console.log("approveWeight():: Deleted unapproved entry.")
                },
                error: function(e) {
                    console.log(e);
                },
            });
        });
    }
    //Clone the weight entry data that was received via websocket and use it to create a new entry which is approved
function approveWeight() {
    var weight = messageval;
    last_messageval = messageval;
    lastmsg_t = sockmsg_t;
    tizen.power.release('SCREEN');
    tau.closePopup($("#sock-weight-popup"));
    update({
        key: "last_weight",
        value: weight
    }, ["settings"]);
    add({
        eventKey: new Date().getTime(),
        eventType: "ntf",
        eventOccuredAt: new Date().getTime(),
        eventData: {
            action: "APPROVE"
        },
    }, ["activity"]);
    add({
        eventKey: new Date().getTime(),
        eventType: "gb_activity",
        eventOccuredAt: new Date().getTime(),
        eventData: [{
            gd_tk: "SCALE",
            properties: [{
                propertyTK: "Weight",
                value: weight
            }, {
                propertyTK: "APPROVED_BY_PATIENT",
                value: "yes"
            }],
        }, ],
    }, ["activity"]);
    //delete the unapproved entry using the received entry data
    //deleteEntry();

    tau.openPopup($("#approving-popup"));
    setTimeout(() => {
        disablebBackButton = false;
        tau.closePopup($("#approving-popup"));
        approvalDone();
    }, 2500);
}

//Deny the weight entry that was received via websocket
function denyWeight() {
    tau.closePopup($("#sock-weight-popup"));
    tizen.power.release('SCREEN');
    add({
        eventKey: new Date().getTime(),
        eventType: "ntf",
        eventOccuredAt: new Date().getTime(),
        eventData: {
            action: "DENY"
        },
    }, ["activity"]);
    //delete the unapproved entry using the received entry data
    //deleteEntry();
}

//Show appreciative message on approval
function approvalDone() {
    var messages = [
        "Klaar is kees",
        "Goed gedaan",
        "Super",
    ];
    $("#approved-message").html(
        "<div class='centerelement'><img src='/contents/popup/images/tw_ic_popup_btn_check.png' width='125' height='125' /></div>" +
        messages[Math.round(Math.random() * 10) % messages.length] +
        "!"
    );
    tau.openPopup($("#approved-popup"));
    setTimeout(() => {
        tau.closePopup($("#approved-popup"));
    }, 2500);
}

//grab the dates and timestamps of all SCALE entries
function getWeightTimeData() {
    weight_times_c = [];
    weight_times = [];
    $.when(readOne("playerID", ["settings"])).done(function(data) {
        playerID = JSON.parse(data);
    });
    $.when(readOne("token", ["settings"])).done(function(token) {
        $.ajax({
            url: config.BASE_URL +
                "/players/" +
                playerID +
                config.ACITIVTY_ENDPOINT +
                "&sort=-date&gds=SCALE", //filter out SCALE entries, retrieve them backwards starting from the latest entry
            type: "GET",
            dataType: "json",
            headers: {
                Authorization: "Bearer " + token,
            },
            //     timeout: 5000,
            success: function(data) {
                for (i = 0; i < data.length; i++) {
                    for (j = 0; j < data[i].propertyInstances.length; j++) {
                        //only use approved values
                        if (data[i].propertyInstances[j].property.translationKey == "APPROVED_BY_PATIENT" && data[i].propertyInstances[j].value == "yes") {
                            //for each entry, get the date (day of the month) of the entry
                            var ent_d = new Date(data[i].date);
                            ent_d = ent_d.getDate();
                            //grab latest entry (control date) from the control array
                            if (weight_times_c.length > 0) {
                                ent_c = weight_times_c[weight_times_c.length - 1];
                            } else {
                                //if the control array is empty, use 0
                                ent_c = 0;
                            }
                            // check if the next entry date is the same as the control date
                            if (ent_c != ent_d) {
                                //if its not, calculate how many minutes into that day (date) the entry was created
                                ent_dt = new Date(data[i].date);
                                ent_mins = (ent_dt.getHours() * 60) + ent_dt.getMinutes();
                                //push the amount of minutes to a separate array (timestamp array)
                                weight_times.push(ent_mins);
                                /*
                                 * save the new 'unique' entry date to the control array, this ensures a maximum of one 'timestamp' entry per day.
                                 * since weight entries are retrieved from new to old, this always uses the latest entry on a particular day.
                                 */
                                weight_times_c.push(ent_d);
                            }
                        }
                    }
                };
                //reverse the processed timestamp array
                weight_times.reverse();
                console.log(weight_times);
                //use the timestamps to calculate an array of exponential moving averages
                var EMAtimes = EMACalc(weight_times, config.EMA_days);
                //update the latest calulated EMA value in the database
                finalEMAtime = EMAtimes[EMAtimes.length - 1];
                parseInt(finalEMAtime);
                console.log("getWeightTimeData:: final time: " + finalEMAtime);
                update({
                    key: "finalEMA",
                    value: finalEMAtime
                }, ["settings"]);
                //also save the unique dates that a weight value were entered into gamebus
                update({
                    key: "measuredays",
                    value: JSON.stringify(weight_times_c)
                }, ["settings"]);
            },
            error: function(e) {
                console.log(e + "getEntryTimes:: Failed to grab scale entries from gamebus.");
                //if there is no internet connection or no values, try to use the last known EMA
                $.when(readOne("finalEMA", ["settings"])).done(function(data) {
                    if (token != null && data != null) {
                        console.log("getEntryTimes:: last saved EMA: " + data);
                    } else {
                        console.log("getEntryTimes:: error token: " + token + ", data: " + data);
                    }
                });
            },
        });
    });
}

//calculate the Exponential Moving Average value of all subsequent weight entries.
function EMACalc(mArray, mRange) {
    var k = config.EMA_smoothing / (mRange + 1);
    // first item is just the same as the first item in the input
    emaArray = [mArray[0]];
    // for the rest of the items, they are computed with the previous one
    for (var i = 1; i < mArray.length; i++) {
        emaArray.push((mArray[i] * k + emaArray[i - 1] * (1 - k)).toFixed(0));
    }
    /*
     * based on the configuration, the return value is an average of the timestamps of all SCALE entries, with entries becoming exponentially
     * more important the more recent they were recorded (e.g. return_value = yesterday * 0.5 + 2_days_ago * 0.25 + 3_days_ago * 0.125 + ...).
     * The purpose of this is to better adapt to variations over time.
     */
    return emaArray;
}
var notifTimermsg;
//pick a fitting notification message for the situation.
function picknotif() {
    let notifmsges = ["Heeft u zich al gewogen vandaag?",
        "Vergeet niet uw gewicht te meten vandaag!",
        "Goed dat u zich vandaag al heeft gewogen!",
        "Goed dat u regelmatig meet, hou dit vol!"
    ];
    console.log("picking a notification..");
    //grab all days a weight measurement was made on
    $.when(readOne("measuredays", ["settings"])).done(function(mdays) {
        //introduce a small randomization factor
        var frequencylimiter = Math.floor(Math.random() * 3);
        //if a weight entry exists
        if (mdays != null) {
            days = JSON.parse(mdays);
            //if a user has consistently measured 4 days in a row & the randomization check is passed, pick message praising consistency
            if (frequencylimiter == 0 && days.length > 3 && days[0] == days[1] + 1 && days[1] == days[2] + 1 && days[2] == days[3] + 1) {
                console.log(notifmsges[3]);
                notifTimermsg = notifmsges[3];
            }
            //if the latest measurement day matches today
            else if (new Date().getDate() == days[0]) {
                console.log(notifmsges[2]);
                notifTimermsg = notifmsges[2];
            } else {
                //pick a random message to encourage measuring
                console.log("random");
                notifTimermsg = notifmsges[Math.floor(Math.random() * 2)];
            }
        } else {
            //pick a random message to encourage measuring
            console.log("random");
            notifTimermsg = notifmsges[Math.floor(Math.random() * 2)];
        }
    });
}

function notifTimer() {
    //returns a message string
    picknotif();

    $.when(readOne("finalEMA", ["settings"])).done(function(ema) {
        $.when(readOne("notiftimer", ["settings"])).done(function(data) {
            $.when(readOne("notifsentonday", ["settings"])).done(function(sent) {
                console.log(notifTimermsg);
                //no known entries
                if (ema == null) {
                    console.log("notifTimer:: empty ema");
                } else {
                    notiftimer = new Date();
                    //set the hours and minutes of a notification to the calculated EMA value
                    notiftimer.setHours(0, parseInt(ema), 0, 0);
                    notiftimer_date = notiftimer.getDate();
                    notiftimer = notiftimer.getTime();
                    //if no next notification has been set yet
                    if (data == null) {
                        console.log("notifTimer:: no notiftimer has been set yet");
                        update({
                            key: "notiftimer",
                            value: notiftimer - 86400000 //set the last notification timestamp to yesterday
                        }, ["settings"]);
                        update({
                            key: "notifsentonday",
                            value: notiftimer_date - 1 //set the last notification date to yesterday
                        }, ["settings"]);
                    } else {
                        console.log("notifTimer:: checking if allowed to send a notification!");
                        lastnotiftime = parseInt(data);
                        //check if the scheduled notification timestamp isnt the same as the last one and if it's past the scheduled time
                        if (lastnotiftime != notiftimer && new Date().getTime() >= notiftimer) {
                            notifsent = parseInt(sent);
                            console.log("notifsent:" + notifsent);
                            console.log("notiftimer_date:" + notiftimer_date);
                            //check if a notification wasn't already sent today
                            if (notifsent != notiftimer_date) {
                                //send notification
                                notify({
                                    id: new Date().getTime(),
                                    type: "reminder",
                                    content: notifTimermsg
                                });
                                var id = new Date().getTime();
                                add({
                                    eventKey: id,
                                    eventType: "ntf",
                                    eventOccuredAt: new Date().getTime(),
                                    eventData: {
                                        action: "RECEIVED"
                                    },
                                }, ["activity"]);
                                add({
                                    eventKey: id,
                                    eventType: "ntf",
                                    eventOccuredAt: new Date().getTime(),
                                    eventData: {
                                        action: notifTimermsg
                                    },
                                }, ["activity"]);
                                //save the timestamp and day of the notification that is being sent 
                                update({
                                    key: "notiftimer",
                                    value: notiftimer
                                }, ["settings"]);
                                update({
                                    key: "notifsentonday",
                                    value: notiftimer_date
                                }, ["settings"]);
                            }
                        }
                    }
                }
            });
        });
    });
}


function startQstn() {
    prepareUI(); //create dynamic questionnaire
    tau.openPopup(preparingPopup);
    setTimeout(() => {
        tau.closePopup(preparingPopup);
        tau.openPopup($("#q-1")); //open the first question in the set of questionnaires
    }, 3000);

    /*
	 * old (hardcoded) questionnaire element, made redundant by dynamic self-reporting
	 * 
    qstcntr = qstcntr + question;
    if (answer == 2) {
        add({
            eventKey: new Date().getTime(),
            eventType: "ntf",
            eventOccuredAt: new Date().getTime(),
            eventData: {
                action: "STARTQSTN"
            },
        }, ["activity"]);
        qstcntr = 0;
        tau.openPopup($("#qstn-popup"));
    }
    if (answer == 0) {
        qstanswers.splice(qstcntr - 1, 1, "no");
    }
    if (answer == 1) {
        qstanswers.splice(qstcntr - 1, 1, "yes");
    }
    if (qstcntr < qstquestions.length) {
        document.getElementById("qstn-content").innerHTML = qstquestions[qstcntr];
    } else {
        tau.closePopup($("#qstn-popup"));
        qstcntr = 0;
        console.log(qstanswers);
        disablebBackButton = true;     
        add({
            eventKey: new Date().getTime(),
            eventType: "gb_activity",
            eventOccuredAt: new Date().getTime(),
            eventData: [{
                gd_tk: "BOD_RESPOND",
                properties: [{
                    propertyTK: "SWOLLEN_ANKLE",
                    value: qstanswers[0]
                }, {
                    propertyTK: "EXTRA_SHORTNESS_OF_BREATH",
                    value: qstanswers[1]
                }, {
                    propertyTK: "LOST_APPETITE",
                    value: qstanswers[2]
                }, {
                    propertyTK: "FEEL_FULL",
                    value: qstanswers[3]
                }],
            }, ],
        }, ["activity"]);
        tau.openPopup($("#approving-popup"));
        setTimeout(() => {
            disablebBackButton = false;
            tau.closePopup($("#approving-popup"));
            approvalDone();
        }, 3500);
    }
    */
}

//delete the latest SCALE entry in the gamebus database
function deleteLatestWeight() {
    document.getElementById("delete-latest-msg").innerHTML = "Deleting..";
    tau.closePopup($("delete-latest-weight-check-popup"));
    tau.openPopup($("delete-latest-weight-popup"));
    document.getElementById("delete-weight-btn").style.display = "none";
    disablebBackButton = true;
    add({
        eventKey: new Date().getTime(),
        eventType: "ntf",
        eventOccuredAt: new Date().getTime(),
        eventData: {
            action: "DELETE"
        },
    }, ["activity"]);
    setTimeout(() => {
        tau.closePopup($("#delete-latest-weight-popup"));
        disablebBackButton = false;
    }, 3000);
    $.when(readOne("token", ["settings"])).done(function(token) {
        $.when(readOne("last_weight_id", ["settings"])).done(function(id) {
            if (token != null && id != null) {
                $.ajax({
                    url: config.BASE_URL +
                        "/activities/" +
                        id,
                    type: "DELETE",
                    headers: {
                        Authorization: "Bearer " + token,
                    },
                    success: function(data) {
                        console.log("deleteLatestWeight():: Deleted last entry.");
                        document.getElementById("delete-latest-msg").innerHTML = "Laatste waarde succesvol verwijderd.";
                    },
                    error: function(e) {
                        console.log(e);
                        document.getElementById("delete-latest-msg").innerHTML = "Iets ging fout..";
                    },
                });
            }
        });
    });
}

//grab 5 latest oximeter entries from gamebus
function getOximeter() {
    $.when(readOne("playerID", ["settings"])).done(function(data) {
        if (data != null) {
            playerID = JSON.parse(data);
            console.log("getOximeter - player ID:" + playerID);
        }
    });
    $.when(readOne("token", ["settings"])).done(function(token) {
        $.ajax({
            url: config.BASE_URL +
                "/players/" +
                playerID +
                config.ACITIVTY_ENDPOINT +
                "&sort=-date&gds=OXIMETER&limit=5",
            type: "GET",
            dataType: "json",
            headers: {
                Authorization: "Bearer " + token,
            },
            success: function(data) {
                console.log("succesfull call to gamebus database!");
                //if there are entries
                if (data.length > 0) {
                    let oxivals = [];
                    let bpmvals = [];
                    var oxisum = 0;
                    var bpmsum = 0;

                    //grab date & time info of latest oxi entry
                    var lo_t = new Date(data[0].date);
                    let [lo_month, lo_day, lo_hr, lo_min] = [lo_t.toLocaleString('nl-NL', {
                        month: 'long'
                    }), lo_t.getDate(), lo_t.getHours(), String(lo_t.getMinutes()).padStart(2, "0")];

                    update({
                        key: "last_oxi_time",
                        value: JSON.stringify([lo_month, lo_day, lo_hr, lo_min])
                    }, ["settings"]);

                    //each oximeter entry consists of two arrays (oxygen saturation & heartrate)
                    for (i = 0; i < data.length; i++) {
                        //separate the arrays
                        var oxi = JSON.parse(data[i].propertyInstances[1].value);
                        var bpm = JSON.parse(data[i].propertyInstances[0].value);
                        //for each entry, grab the total sum of all the values in each array
                        const sumoxi = oxi.reduce((a, b) => a + b, 0);
                        const sumbpm = bpm.reduce((a, b) => a + b, 0);
                        //divide the total sum of each array by their length to get the average values
                        const avgoxi = (sumoxi / oxi.length) || 0;
                        const avgbpm = (sumbpm / bpm.length) || 0;
                        //push the average values to a separate array
                        oxivals.push(avgoxi);
                        bpmvals.push(avgbpm);
                    }
                    //grab the sum of the two arrays of averages once more
                    for (i = 0; i < oxivals.length; i++) {
                        oxisum += JSON.parse(oxivals[i]);
                        bpmsum += JSON.parse(bpmvals[i]);
                    }
                    //divide this sum by the length once more to get the final average value of the last 5 entries 
                    var avgoxival = (oxisum / oxivals.length).toFixed(1);
                    var avgbpmval = (bpmsum / bpmvals.length).toFixed(0);
                    //save the both the latest entry averages as well as the average values over 5 entries
                    update({
                        key: "last_oxi",
                        value: oxivals[0].toFixed(1)
                    }, ["settings"]);
                    update({
                        key: "last_bpm",
                        value: bpmvals[0].toFixed(0)
                    }, ["settings"]);
                    update({
                        key: "recent_oxi",
                        value: avgoxival
                    }, ["settings"]);
                    update({
                        key: "recent_bpm",
                        value: avgbpmval
                    }, ["settings"]);

                    //display these values
                    document.getElementById("manage-oxi-msg").innerHTML = "Laatst gemeten saturatie: <b>" + oxivals[0].toFixed(1) +
                        "</b>% op " + lo_day + " " + lo_month + " om " + lo_hr + ":" + lo_min + ".";
                    document.getElementById("manage-bpm-msg").innerHTML = "Laatst gemeten hartslag: <b>" + bpmvals[0].toFixed(0) + "</b>bpm.";

                    console.log("getOximeter:: Added to database: " + oxivals[0] + ", " + bpmvals[0] + ", " + avgoxival + ", " + avgbpmval);
                } else {
                    //if there aren't any oximeter entries
                    document.getElementById("manage-oxi-msg").innerHTML = "Geen opgeslagen zuurstof / hartslagwaardes gevonden..";
                }
            },
            error: function(e) {
                console.log(e);
                // where the network connection is lost but the app had already received oximeter values from previous launches
                $.when(readOne("last_oxi", ["settings"])).done(function(oxidata) {
                    $.when(readOne("last_bpm", ["settings"])).done(function(bpmdata) {
                        $.when(readOne("last_oxi_time", ["settings"])).done(function(oxitime) {
                            //show no connection and if appliccable (present in database) show most last values
                            if (token != null && bpmdata != null && oxidata != null && oxitime != null) {
                                recent_oxi = JSON.parse(oxidata);
                                recent_bpm = JSON.parse(bpmdata);
                                otArr = JSON.parse(oxitime);

                                document.getElementById("manage-oxi-msg").innerHTML = "Geen verbinding met database..";
                                document.getElementById("manage-bpm-msg").innerHTML = "Laatste opgeslagen waarden: <b>" + recent_oxi + "</b>%, <b>"
                                recent_bpm + "</b>bpm op " + otArr[0] + " " + otArr[1] + " om " + otArr[2] + ":" + otArr[3];
                            } else {
                                console.log("error token: " + token + ", data: " + oxidata + "," + bpmdata);
                                document.getElementById("manage-oxi-msg").innerHTML = "Geen verbinding met database..";
                            }
                        });
                    });
                });
            },
        });
    });
}

//grab 5 latest blood pressure entries from gamebus
function getBloodpressure() {
    $.when(readOne("playerID", ["settings"])).done(function(data) {
        if (data != null) {
            playerID = JSON.parse(data);
            console.log("getBloodpressure - player ID:" + playerID);
        }
    });
    $.when(readOne("token", ["settings"])).done(function(token) {
        $.ajax({
            url: config.BASE_URL +
                "/players/" +
                playerID +
                config.ACITIVTY_ENDPOINT +
                "&sort=-date&gds=SPHYGMOMETER&limit=5", //grab last 5 saved instances
            type: "GET",
            dataType: "json",
            headers: {
                Authorization: "Bearer " + token,
            },
            success: function(data) {
                console.log("succesfull call to gamebus database!");
                if (data.length > 0) {
                    let sysvals = [];
                    let diavals = [];
                    var syssum = 0;
                    var diasum = 0;

                    //grab date & time info of latest bloodpressure entry
                    var lb_t = new Date(data[0].date);
                    let [lb_month, lb_day, lb_hr, lb_min] = [lb_t.toLocaleString('nl-NL', {
                        month: 'long'
                    }), lb_t.getDate(), lb_t.getHours(), String(lb_t.getMinutes()).padStart(2, "0")];

                    update({
                        key: "last_bp_time",
                        value: JSON.stringify([lb_month, lb_day, lb_hr, lb_min])
                    }, ["settings"]);

                    for (i = 0; i < data.length; i++) {
                        //for each entry, grab the systolic and diastolic values and push them to separate arrays
                        var sys = JSON.parse(data[i].propertyInstances[0].value);
                        var dia = JSON.parse(data[i].propertyInstances[1].value);
                        sysvals.push(sys);
                        diavals.push(dia);
                    }
                    for (i = 0; i < sysvals.length; i++) {
                        //calculate sum of all values in the arrays
                        syssum += JSON.parse(sysvals[i]);
                        diasum += JSON.parse(diavals[i]);
                    }
                    //divide by length to get average of last 5 entries
                    var avgsysval = (syssum / sysvals.length).toFixed(0);
                    var avgdiaval = (diasum / diavals.length).toFixed(0);
                    //save recent averages and latest entries
                    update({
                        key: "last_bp_sys",
                        value: sysvals[0]
                    }, ["settings"]);
                    update({
                        key: "last_bp_dia",
                        value: diavals[0]
                    }, ["settings"]);
                    update({
                        key: "recent_bp_sys",
                        value: avgsysval
                    }, ["settings"]);
                    update({
                        key: "recent_bp_dia",
                        value: avgdiaval
                    }, ["settings"]);
                    //display recent averages and latest entries to user
                    document.getElementById("manage-lastbp-msg").innerHTML = "Laatst gemeten bloeddruk: <b>" + sysvals[0] + "/" + diavals[0] + 
                    "</b> op " + lb_day + " " + lb_month + " om " + lb_hr + ":" + lb_min + ".";
                    console.log("getBloodpressure:: Added to database: " + sysvals[0] + ", " + diavals[0] + ", " + avgsysval + ", " + avgdiaval);
                } else {
                    document.getElementById("manage-lastbp-msg").innerHTML = "Geen opgeslagen bloeddrukwaarden gevonden..";
                }
            },
            error: function(e) {
                console.log(e);
                // where the network connection is lost but the app had already received entries from previous launches
                $.when(readOne("last_bp_sys", ["settings"])).done(function(sysdata) {
                    $.when(readOne("last_bp_dia", ["settings"])).done(function(diadata) {
                        $.when(readOne("last_bp_time", ["settings"])).done(function(bptime) {
                            if (token != null && sysdata != null && diadata != null) {
                                recent_sys = JSON.parse(sysdata);
                                recent_dia = JSON.parse(diadata);
                                btArr = JSON.parse(bptime);

                                document.getElementById("manage-lastbp-msg").innerHTML = "Geen verbinding met database..";
                                document.getElementById("manage-recentbp-msg").innerHTML = "Laatst opgeslagen waarde: <b>" +
                                    recent_sys + "/" + recent_dia + "</b> op " + btArr[0] + " " + btArr[1] + " om " + btArr[2] + ":" + btArr[3] + ".";
                            } else {
                                console.log("error token: " + token + ", data: " + sysdata + "," + diadata);
                                document.getElementById("manage-lastbp-msg").innerHTML = "Geen verbinding met database..";
                            }
                        });
                    });
                });
            },
        });
    });
}

//handles push notifications that contain a questionnaire element
function questionnairePushHandler(appData) {

    if (appData.questionnaire.repetition == "once") { //if the questionnaire is only to be filled in once
        add({
            eventKey: new Date().getTime(),
            eventType: "ntf",
            eventOccuredAt: new Date().getTime(),
            eventData: {
                action: "RECEIVE_PUSH_ONCE"
            },
        }, ["activity"]);
        $.when(readOne("push_questions_temp", ["settings"])).done(function(qstns) {
            qstnsStr = qstns;
            pushStr = JSON.stringify(appData.questionnaire.questions);
            //if the questionnaire isn't the same as the one already saved
            if (qstnsStr != pushStr) {
                update({
                    key: "push_questions_temp",
                    value: pushStr
                }, [
                    "settings",
                ]);
                update({
                    key: "push_questions_temp_completed",
                    value: "no"
                }, [
                    "settings",
                ]);
                
                console.log("push has received a new unique questionnaire with \"once\" !");
                document.getElementById("notif_button").style.display = "inline-block";
            } else {
                console.log("push has \"once\" questionnaire data, but is not unique.");
            }

        });
    }
    if (appData.questionnaire.repetition == "replace") { //if the questionnaire is a replacement
    	document.getElementById("notif_button").style.display = "inline-block";
        update({
            key: "push_questions_replace",
            value: JSON.stringify(appData.questionnaire.questions)
        }, [
            "settings",
        ]);
        add({
            eventKey: new Date().getTime(),
            eventType: "ntf",
            eventOccuredAt: new Date().getTime(),
            eventData: {
                action: "RECEIVE_PUSH_REPLACE"
            },
        }, ["activity"]);
    }
    console.log("questions received via push message");
    console.log(JSON.stringify(appData.questionnaire.questions));
    console.log("repetition: " + appData.questionnaire.repetition);
}

function parseQuestionnaire(data) {
    if (data.hasOwnProperty("questionnaire")) {
        if (data.questionnaire.questions.length > 0) {
            if (data.questionnaire.repetition == "once") {
                $.when(readOne("push_questions_temp", ["settings"])).done(function(qstns) {
                    qstnsStr = qstns;
                    configStr = JSON.stringify(data.questionnaire.questions);
                    if (qstnsStr != configStr) {
                        update({
                            key: "push_questions_temp",
                            value: configStr
                        }, [
                            "settings",
                        ]);
                        update({
                            key: "push_questions_temp_completed",
                            value: "no"
                        }, [
                            "settings",
                        ]);
                        console.log("gb_config has received a new unique questionnaire with \"once\" !");
                        document.getElementById("notif_button").style.display = "inline-block";
                    } else {
                        console.log("gb_config has questionnaire data, but is not unique.");
                    }
                });
            } else if (data.questionnaire.repetition == "replace") {
                update({
                    key: "push_questions_replace",
                    value: JSON.stringify(data.questionnaire.questions)
                }, [
                    "settings",
                ]);
            } else if (data.questionnaire.repetition == "base") {
                update({
                    key: "base_questions",
                    value: JSON.stringify(data.questionnaire.questions)
                }, [
                    "settings",
                ]);
            } else {
                console.log("unrecognised questionnaire repetition");
            }
        }
        update({
            key: "config_questionnaire_cooldown",
            value: data.questionnaire.cooldown
        }, [
            "settings",
        ]);
    } else {
        console.log("gb_config contains no questionnaire");
    }
}

var hrpopup = document.getElementById("hr-monitoring-popup");

//start sensors when continuous hr monitor is opened.
hrpopup.addEventListener("popupbeforeshow", function() {
    console.log("`popupbeforeshow` fired: opened Heart Rate Monitor");
    tizen.power.request('SCREEN', 'SCREEN_NORMAL');
    // start sensors
    sensorForceStop = false;
    monitoring = true;
    tizen.alarm.removeAll();
    hroption = {
    	    'callbackInterval': 1000
    	};
    startSensors();
});

//stop sensors when hr monitor is closed.
hrpopup.addEventListener("popuphide", function() {
    console.log("`popuphide` fired: closed Heart Rate Monitor");
    tizen.power.release('SCREEN');
    // stop sensors
    sensorForceStop = true;
    monitoring = false;
    makeAlarm();
	$("#canvascontainer").html(' ');
});

/*
 * several passthrough functions to easily add interaction data elements and database entry grabbers to buttons
 */
function logmanually() {
    tau.openPopup($("#log-weight-popup"));
}

function manage() {
    tau.openPopup($("#manage-popup"));
    var appId = tizen.application.getCurrentApplication().appInfo.id;
    tizen.badge.setBadgeCount(appId, 0);
}

function openHRMpage(){
	add({
        eventKey: new Date().getTime(),
        eventType: "ntf",
        eventOccuredAt: new Date().getTime(),
        eventData: {
            action: "MONITOR HEARTRATE"
        },
    }, ["activity"]);
	document.getElementById("hrm-launch-container").innerHTML = "opstarten..";
	document.getElementById("heartrate-value").style.color = "#001d42";
	tau.openPopup($("#hr-monitoring-popup"));
}

function onerrorCB(error) {
    console.log('Error occurred. Name:' + error.name + ', message: ' + error.message);
}


function manageWeight() {
    add({
        eventKey: new Date().getTime(),
        eventType: "ntf",
        eventOccuredAt: new Date().getTime(),
        eventData: {
            action: "MANAGEWEIGHT"
        },
    }, ["activity"]);
    getWeight();
    tau.openPopup($("#manage-weight-popup"));
}

function deleteLatestWeightCheck() {
	tau.openPopup($("#delete-latest-weight-check-popup"));
}

function keepLatestWeight() {
	tau.openPopup($("#manage-weight-popup"));
}

function manageBp() {
    add({
        eventKey: new Date().getTime(),
        eventType: "ntf",
        eventOccuredAt: new Date().getTime(),
        eventData: {
            action: "MANAGEBP"
        },
    }, ["activity"]);
    getBloodpressure();
    tau.openPopup($("#manage-bp-popup"));
}

function manageOxi() {
    add({
        eventKey: new Date().getTime(),
        eventType: "ntf",
        eventOccuredAt: new Date().getTime(),
        eventData: {
            action: "MANAGEOXI"
        },
    }, ["activity"]);
    getOximeter();
    tau.openPopup($("#manage-oxi-popup"));
}

function weightInfo(){
	infoType = "weight";
	$("#info-msg").html(
			"Op deze pagina kunt u uw laatst opgeslagen gewichtsmeting zien, het kan na een meting een paar minuten duren" +
			" voordat deze waarde bijgewerkt is.</br></br> Mocht de getoonde meting onjuist zijn, dan kunt u" +
			" er voor kiezen om deze te verwijderen uit de database. Tevens heeft u de mogelijkheid om uw gewichtsmeting" +
			" handmatig in te voeren."
	    );
    $("#info-img").html('<img src="/contents/popup/images/scale.png" width="75" height="75" />');
	tau.openPopup($("#info-popup"));
}

function BpInfo(){
	infoType = "bp";
	$("#info-msg").html(
			"Op deze pagina ziet u uw laatst opgeslagen boven- en onderdruk. In de meeste gevallen geldt: hoe lager uw bloeddruk, hoe beter," +
			" waarbij uw bovendruk (het hoge getal) belangrijker is dan uw onderdruk. </br></br>" + 
			" <b>120/80</b> of lager is een ideale bloeddruk, tot <b>140/90</b> is een normale bloeddruk, hier boven is een hoge bloeddruk.</br></br>" +
			"Een enkele keer een verhoogde bloeddruk meten is vaak geen reden tot zorg; het is normaal dat uw bloeddruk schommelt door factoren als" +
			" tijd, voeding en lichaamsbeweging. Meestal is uw bloeddrukwaarde 's-middags hoger dan 's-avonds of 's-ochtends. Zijn uw metingen" +
			" consistent hoog? Neem dan contact op met uw huisarts. </br></br> Door gezond te leven kunt u uw bloeddruk verlagen."
	    );
    $("#info-img").html('<img src="/contents/popup/images/bloodpressure.png" width="75" height="75" />');
	    tau.openPopup($("#info-popup"));

}

function OxiInfo(){
	infoType = "oxi";
	$("#info-msg").html(
			"Op deze pagina ziet u uw laatst opgeslagen zuurstof saturatie en hartslag tijdens deze meting, oftewel in hoeverre uw bloed verzadigd is" +
			" met zuurstof, uitgedrukt in een percentage.</br></br> Een normale saturatie is 95% of hoger. Is uw saturatie consistent lager?" +
			" Neem dan contact op met uw huisarts."
	    );
	$("#info-img").html('<img src="/contents/popup/images/oxygen.png" width="75" height="75" />');
	    tau.openPopup($("#info-popup"));
}

function HRMInfo(){
	infoType = "hrm";
	$("#info-msg").html(
			"Met de hartslagmonitor kunt u schommelingen in ur hartslag meten waar u ook bent. Zo kunt u bijvoorbeeld zien hoe uw hartslag" +
			" reageert op inspanning of wanneer u juist even een moment van rust neemt. </br></br> Na 20 minuten stopt de meting om batterij te besparen." +
			" Op dit moment wordt deze meting niet opgeslagen in uw online omgeving."
	    );
	$("#info-img").html('<img src="/contents/popup/images/heartbeat.png" width="75" height="55" />');
	    tau.openPopup($("#info-popup"));
}