"""
365 Hi Mobile CRM - automatic checks run by GitHub before every publish.
Uses MADE-UP customers only (generated below) and an in-memory stand-in server.

Run locally:  pip install playwright && playwright install chromium
              python tests/test_crm.py          (from the repo folder)
Exit code 0 = all checks passed; 1 = something broke (the site is then NOT published).
"""
import json, os, sys, threading, functools, http.server, socketserver, subprocess, time, datetime, traceback, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_PORT, API_PORT = 8765, 4000
API = f"http://127.0.0.1:{API_PORT}"
CHROME = os.environ.get("CHROME_PATH") or None

# ---------------------------------------------------------------- made-up data
TODAY = datetime.date.today()
def d(days): return (TODAY + datetime.timedelta(days=days)).isoformat()
def make_seed():
    cs, ss = [], []
    nats = ["VIETNAM", "CHINA", "NEPAL", "UZBEKISTAN", "INDONESIA", "MONGOLIA"]
    for i in range(48):
        cid = f"c{i}"
        post = i % 4 == 0
        dob = "2009-05-01" if i % 11 == 3 else f"{1985 + i % 15}-0{1 + i % 9}-1{i % 9}"   # some under 19
        cs.append({"id": cid, "name": f"TEST CUSTOMER {i}", "phone": f"010-{1000 + i:04d}-{2000 + i:04d}",
                   "nationality": nats[i % len(nats)], "dob": dob, "idType": "Passport" if i % 5 == 0 else "ARC",
                   "idNumber": f"P{i:05d}" if i % 5 == 0 else f"9{i:05d}-5000000", "idExpiry": "2030-01-01",
                   "subType": "postpaid" if post else "prepaid", "carrierType": "KT", "planType": "" if i % 7 == 0 else "신규가입",
                   "referral": "school", "rating": 1 + i % 5, "handlerName": "Staff", "years": i % 6, "occupation": "Student",
                   "createdAt": d(-200 + i)})
        if post:
            plan = ["5G EASY L", "5G PLAN C", "PLAN A", "5G EASY M"][i % 4]
            ss.append({"id": f"s{i}", "customerId": cid, "type": "postpaid", "plan": plan, "activationDate": d(-120 - i),
                       "durationDays": 365, "expiryDate": d(245 - i), "status": "active", "isActive": True, "changeReason": "new",
                       "price": 0, "sellingPrice": 0, "received": 0, "paymentMethod": "", "monthlyFee": 22000,
                       "discountPerMonth": 3000 if i % 8 == 0 else 0, "company": "청춘", "partnerCompany": "SK",
                       "svcCarrierType": "SKT", "carrier": "SKT", "number": f"010-{1000 + i:04d}-{2000 + i:04d}"})
        else:
            dur = [30, 60, 90][i % 3]
            start = -10 - i * 3
            ss.append({"id": f"s{i}", "customerId": cid, "type": "prepaid", "plan": f"{dur}일", "activationDate": d(start),
                       "durationDays": dur, "expiryDate": d(start + dur), "status": "active", "isActive": True,
                       "changeReason": "recharge" if i % 6 == 1 else "new", "price": 36000 if dur == 30 else 99000,
                       "sellingPrice": 36000 if dur == 30 else 99000, "received": 20000 if i % 9 == 2 else (36000 if dur == 30 else 99000),
                       "paymentMethod": "" if i % 3 == 0 else "cash", "company": "프리티Free T", "svcCarrierType": "LGU알뜰폰",
                       "carrier": "LGU알뜰폰", "number": f"010-{1000 + i:04d}-{2000 + i:04d}"})
            if i % 6 == 1:   # an older, ended plan in the history
                ss.append({"id": f"h{i}", "customerId": cid, "type": "prepaid", "plan": "90일", "activationDate": d(start - 90),
                           "durationDays": 90, "expiryDate": d(start), "status": "active", "isActive": False, "endedAt": d(start),
                           "endedSeq": i, "changeReason": "plan_change", "price": 99000, "sellingPrice": 99000, "received": 99000,
                           "paymentMethod": "cash", "company": "프리티Free T", "svcCarrierType": "LGU알뜰폰", "carrier": "LGU알뜰폰"})
    cs[5]["idChangeRequest"] = {"status": "pending", "requestedDate": d(-3), "handledBy": "Staff"}
    dup = dict(cs[6]); dup.update({"id": "c_dup", "name": "TEST CUSTOMER 6 COPY"}); cs.append(dup)
    img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    tpls = [{"id": "t1", "name": "KT form", "carrier": "KT", "purpose": "general", "imageDataUrl": img, "fields": []},
            {"id": "t2", "name": "SKT form", "carrier": "SKT", "purpose": "general", "imageDataUrl": img, "fields": []}]
    return {"customers": cs, "services": ss, "templates": tpls, "reminderState": {}}

# ---------------------------------------------------------------- servers
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def start_servers():
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", SITE_PORT), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    mock = subprocess.Popen(["node", os.path.join(ROOT, "tests", "mock_server.js")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try: urllib.request.urlopen(API + "/api/health"); break
        except Exception: time.sleep(0.1)
    return srv, mock
def api_state(): return json.loads(urllib.request.urlopen(API + "/__state").read())
def api_seed(seed):
    urllib.request.urlopen(urllib.request.Request(API + "/__seed", data=json.dumps(seed).encode(), method="POST",
                                                  headers={"Content-Type": "application/json"}))

# ---------------------------------------------------------------- checks
RESULTS = []
def check(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))
    print(("  PASS  " if cond else "  FAIL  ") + name + ("" if cond else f"   -> {detail}"))

def open_app(b, seed, lang="en", server=False):
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Asia/Seoul")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda dlg: dlg.accept())
    pg.route("**/cdnjs.cloudflare.com/**", lambda r: r.fulfill(status=200, body="window.XLSX={utils:{}};", content_type="application/javascript"))
    pg.goto(f"http://127.0.0.1:{SITE_PORT}/index.html")
    if server:
        pg.evaluate("(l)=>{localStorage.clear();localStorage.setItem('himobile_crm_lang',l)}", lang); pg.reload(); pg.wait_for_timeout(400)
        pg.fill("#lockServerUrl", API); pg.fill("#lockPassword", "2052"); pg.click("#lockUnlockBtn")
        pg.wait_for_function("document.getElementById('appRoot').style.display!=='none'", timeout=15000); pg.wait_for_timeout(2000)
    else:
        pg.evaluate("(a)=>{localStorage.clear();localStorage.setItem('himobile_crm_v1',JSON.stringify(a[0]));localStorage.setItem('himobile_unlocked','1');localStorage.setItem('himobile_crm_lang',a[1]);}", [seed, lang])
        pg.reload(); pg.wait_for_timeout(1200)
    pg.evaluate("window.quickPrintService=function(){}; window.print=function(){};")
    return ctx, pg, errs

def ids(rows): return {r["id"] for r in rows}

def run(b):
    seed = make_seed()

    print("Every page and every customer profile opens without errors")
    for lang in ("en", "zh"):
        ctx, pg, errs = open_app(b, seed, lang)
        for page in ("dashboard", "sheet", "ai", "reminders", "reports", "templates", "io"):
            pg.evaluate(f"goTo('{page}')"); pg.wait_for_timeout(150)
        bad = pg.evaluate("""()=>{const out=[]; for(const c of DB.customers){ openCustomerDetail(c.id);
            const b=document.getElementById('detailBody'); if(!b.querySelector('.pf-card')||!b.querySelector('#detailActiveSub')) out.push(c.id); closeAllModals(); } return out; }""")
        check(f"[{lang}] all pages render", not errs, errs[:3])
        check(f"[{lang}] all {len(seed['customers'])} profiles show their cards", not bad, bad[:5])
        ctx.close()

    print("New customer, edit, and the data rules")
    ctx, pg, errs = open_app(b, seed)
    n0 = pg.evaluate("[DB.customers.length, DB.services.length]")
    pg.click("#btnNewCustomerTop"); pg.click("#chooseTypePrepaid"); pg.wait_for_timeout(300)
    pg.fill("#f_name", "CI NEW PREPAID"); pg.fill("#f_phone", "010-7777-0001"); pg.fill("#f_nationality", "NEPAL"); pg.fill("#f_dob", "990101")
    pg.evaluate("[...document.querySelectorAll('#f_idType_group .tile-radio')].find(x=>x.dataset.val==='Passport').click()"); pg.fill("#f_idNumber", "PCI1")
    pg.select_option("#p3_company_group_mirror", index=2); pg.wait_for_timeout(100)
    pg.select_option("#p3_svcCarrierType_group_mirror", index=1); pg.wait_for_timeout(200)
    pg.evaluate("[...document.querySelectorAll('#p3_prepaidPlan_group [data-val]')].find(x=>x.dataset.val==='90').click()"); pg.wait_for_timeout(100)
    pg.fill("#p3_tax", "5000"); pg.wait_for_timeout(50)
    check("card tax is added to the total (55,000 + 5,000)", pg.input_value("#p3_finalPricePreview") == "₩60,000", pg.input_value("#p3_finalPricePreview"))
    pg.click("#saveCustomerBtn"); pg.wait_for_timeout(700)
    r = pg.evaluate("""(()=>{const c=DB.customers.find(c=>c.name==='CI NEW PREPAID'); if(!c) return null; const s=activeSubscriptionFor(c.id);
        return {phone:c.phone, num:s&&s.number, type:s&&s.type, dur:s&&s.durationDays, pay:s?(s.paymentMethod||''):null}})()""")
    check("new prepaid customer is saved with its plan", r and r["type"] == "prepaid" and r["num"] == "010-7777-0001", r)
    check("payment method is blank unless chosen", r and r["pay"] == "", r)
    tot = pg.evaluate("(s=>[s.price,s.sellingPrice,s.received])(activeSubscriptionFor(DB.customers.find(c=>c.name==='CI NEW PREPAID').id))")
    check("only the total is saved (price 55,000, total 60,000)", tot == [55000, 60000, 60000], tot)
    pg.evaluate("closeAllModals(); openCustomerModal(DB.customers.find(c=>c.name==='CI NEW PREPAID'))"); pg.wait_for_timeout(300)
    check("editing shows the tax again, so re-saving keeps it", pg.input_value("#p3_tax") == "5000")
    pg.evaluate("closeAllModals()")

    cid = "c1"
    before = pg.evaluate(f"JSON.stringify(getCustomer('{cid}'))")
    pg.evaluate("closeAllModals()"); pg.evaluate(f"openCustomerModal(getCustomer('{cid}'))"); pg.wait_for_timeout(300)
    check("Edit profile after New customer keeps the prepaid fields", pg.evaluate("!!document.getElementById('p3_number')"))
    pg.fill("#f_notes", "ci note"); pg.click("#saveCustomerBtn"); pg.wait_for_timeout(600)
    after = pg.evaluate(f"JSON.stringify(getCustomer('{cid}'))")
    b0, a0 = json.loads(before), json.loads(after)
    norm = lambda v: "" if v is None else v      # a missing field saved as "" is the same thing
    changed = sorted(k for k in set(b0) | set(a0) if norm(b0.get(k)) != norm(a0.get(k)) and k not in ("updatedAt",))
    check("editing one field changes only that field", changed == ["notes"], changed)

    pg.evaluate("closeAllModals()"); pg.click("#btnNewCustomerTop"); pg.click("#chooseTypePrepaid"); pg.wait_for_timeout(300)
    pg.fill("#f_name", "CI ARC SOON"); pg.fill("#f_phone", "010-7777-0002")
    pg.evaluate("[...document.querySelectorAll('#f_idType_group .tile-radio')].find(x=>x.dataset.val==='ARC').click()")
    soon = (TODAY + datetime.timedelta(days=40)).strftime("%y%m%d")
    pg.fill("#f_idExpiry", soon)
    pg.select_option("#p3_company_group_mirror", index=2); pg.select_option("#p3_svcCarrierType_group_mirror", index=1); pg.wait_for_timeout(200)
    pg.click("#saveCustomerBtn"); pg.wait_for_timeout(500)
    check("ARC expiring within 3 months blocks a new prepaid customer", pg.evaluate("!DB.customers.some(c=>c.name==='CI ARC SOON')"))
    pg.evaluate("closeAllModals()")

    expect = {"5G EASY M": ["청춘", "SK", "SKT"], "5G EASY L": ["청춘", "SK", "SKT"], "5G PLAN C": ["청춘", "LG", "LGU"], "PLAN A": ["청춘", "KTM", "KT"]}
    for plan, want in expect.items():
        pg.evaluate("openNewPostpaidModal()"); pg.wait_for_timeout(200)
        pg.evaluate(f"[...document.querySelectorAll('#pc_plan_group [data-val]')].find(x=>x.dataset.val==={json.dumps(plan)}).click()"); pg.wait_for_timeout(150)
        got = pg.evaluate("['pc_company_group','pc_partnerCompany_group','pc_svcCarrierType_group'].map(i=>document.getElementById(i).dataset.selected)")
        check(f"postpaid plan {plan} fills in its company / partner / carrier", got == want, got)
        pg.evaluate("closeAllModals()")
    pg.evaluate("openNewPostpaidModal()"); pg.wait_for_timeout(200)
    pg.fill("#pc_name", "CI NEW POSTPAID"); pg.fill("#pc_nationality", "CHINA"); pg.fill("#pc_number", "010-7777-0003")
    pg.evaluate("[...document.querySelectorAll('#pc_plan_group [data-val]')].find(x=>x.dataset.val==='5G EASY L').click()"); pg.wait_for_timeout(150)
    pg.click("#savePostpaidCustomerBtn"); pg.wait_for_timeout(600)
    r = pg.evaluate("(()=>{const c=DB.customers.find(c=>c.name==='CI NEW POSTPAID'); const s=c&&activeSubscriptionFor(c.id); return s&&[s.plan,s.durationDays]})()")
    check("new postpaid customer is saved with its plan", r == ["5G EASY L", 365], r)

    print("Dashboard and Reminders")
    pg.evaluate("closeAllModals(); goTo('dashboard')"); pg.wait_for_timeout(400)
    check("dashboard shows 4 key figures", pg.locator("#dashStats .dash-kpi").count() == 4)
    check("revenue is compared with the same days last month", "same days last month" in pg.inner_text("#dashStats") or "no data" in pg.inner_text("#dashStats") or "New vs" in pg.inner_text("#dashStats"))
    shown = pg.evaluate("[...document.querySelectorAll('#chartNationality .bar-row')].filter(r=>r.style.display!=='none').length")
    total = pg.evaluate("document.querySelectorAll('#chartNationality .bar-row').length")
    if total > 6:
        pg.click("#chartNationality .more-toggle"); pg.wait_for_timeout(100)
        opened = pg.evaluate("[...document.querySelectorAll('#chartNationality .bar-row')].filter(r=>r.style.display!=='none').length")
        check("long lists fold to 6 with 'Show more'", shown == 6 and opened == total, (shown, opened, total))
    pg.click("[data-dash-opp=u19]"); pg.wait_for_timeout(400)
    check("an opportunity on the dashboard opens that AI Insights list", pg.evaluate("currentPage==='ai' && aiGroup==='u19'"))
    pg.evaluate("reminderTab='all'; goTo('reminders')"); pg.wait_for_timeout(300)
    rid = pg.evaluate("document.querySelector('#reminderList [data-rem-done]')?.dataset.remDone")
    if rid:
        pg.click(f"#reminderList [data-rem-done='{rid}']"); pg.wait_for_timeout(200)
        check("Complete marks a reminder done (and stays on the page)", pg.evaluate(f"DB.reminderState['{rid}']==='completed' && currentPage==='reminders'"))
        pg.evaluate("reminderTab='done'; renderReminders()"); pg.wait_for_timeout(200)
        pg.click(f"#reminderList [data-rem-followup='{rid}']"); pg.wait_for_timeout(200)
        check("Reopen puts it back", pg.evaluate(f"DB.reminderState['{rid}']==='pending'"))
    for tab in ("today", "week", "overdue", "all", "expiring", "postpaidContract", "idChange", "infochange", "old", "done"):
        pg.evaluate(f"reminderTab='{tab}'; renderReminders()"); pg.wait_for_timeout(60)
    check("every Reminders tab opens", not errs, errs[:3])

    print("Reports and Import / Export")
    pg.evaluate("goTo('reports')"); pg.wait_for_timeout(300)
    check("Reports shows sales by staff", pg.locator(".rep-staff-row").count() > 0)
    opts = pg.evaluate("[...document.getElementById('repMonthSelect').options].map(o=>o.value)")
    for v in opts[:4]:
        pg.select_option("#repMonthSelect", v); pg.wait_for_timeout(120)
    pg.click("[data-reportview=daily]"); pg.wait_for_timeout(200)
    day = pg.evaluate("DB.services.find(s=>s.activationDate)?.activationDate")
    pg.fill("#repDaySelect", day); pg.dispatch_event("#repDaySelect", "change"); pg.wait_for_timeout(200)
    rows = pg.locator("#repDailyPrepaidList .rep-day-row, #repDailyPostpaidList .rep-day-row").count()
    tagged = pg.locator("#repDailyPrepaidList .rep-day-row .plan-tag, #repDailyPostpaidList .rep-day-row .plan-tag").count()
    check("daily report shows each sale's plan", rows > 0 and tagged == rows, (rows, tagged))
    check("Reports month and daily views work", not errs and pg.is_visible("#repDaySelect") and not pg.is_visible("#repMonthSelect"), errs[:3])
    pg.click("[data-reportview=monthly]"); pg.wait_for_timeout(100)
    pg.evaluate("goTo('io')"); pg.wait_for_timeout(300)
    check("Import / Export month list is filled in", pg.evaluate("document.getElementById('bulkClearPaymentMonth').options.length") > 1)
    n_c = pg.evaluate("DB.customers.length")
    pg.click("#btnFormatData"); pg.wait_for_timeout(200)
    check("Delete all data asks to type 365HIMOBILE", pg.is_visible(".danger-box") and pg.is_disabled(".danger-box [data-ok]"))
    pg.fill(".danger-input", "365himobile"); pg.wait_for_timeout(50)
    still = pg.is_disabled(".danger-box [data-ok]")
    pg.fill(".danger-input", "365HIMOBILE"); pg.wait_for_timeout(50)
    check("only the exact word unlocks the button", still and not pg.is_disabled(".danger-box [data-ok]"))
    pg.click(".danger-box [data-x]"); pg.wait_for_timeout(150)
    check("Cancel leaves all data untouched", pg.evaluate("DB.customers.length") == n_c and not pg.is_visible(".danger-box"))
    month = pg.evaluate("[...document.getElementById('bulkClearPaymentMonth').options].map(o=>o.value).find(v=>v && DB.services.some(s=>(s.activationDate||'').startsWith(v) && s.paymentMethod))")
    if month:
        pg.select_option("#bulkClearPaymentMonth", month); pg.click("#btnBulkClearPayment"); pg.wait_for_timeout(200)
        pg.fill(".danger-input", "365HIMOBILE"); pg.click(".danger-box [data-ok]"); pg.wait_for_timeout(400)
        left = pg.evaluate(f"DB.services.filter(s=>(s.activationDate||'').startsWith('{month}') && s.paymentMethod).length")
        check("bulk clear runs after typing 365HIMOBILE", left == 0, left)

    print("AI Insights")
    pg.evaluate("closeAllModals(); goTo('ai')"); pg.wait_for_timeout(400)
    n_before = pg.evaluate("Number(document.getElementById('aiListCount').textContent)")
    check("AI Insights shows a list straight away", n_before > 0 and pg.locator(".aio-row").count() == n_before, n_before)
    pg.click(".aio-row [data-ai-done]"); pg.wait_for_timeout(300)
    n_after = pg.evaluate("Number(document.getElementById('aiListCount').textContent)")
    marked = pg.evaluate("Object.entries(DB.reminderState).filter(([k,v])=>k.startsWith('ai:')&&v.startsWith('contacted|')).length")
    check("'Mark contacted' saves and takes the customer off the list", n_after == n_before - 1 and marked == 1, (n_before, n_after, marked))
    pg.check("#aiShowContacted"); pg.wait_for_timeout(200); pg.click(".aio-row.done [data-ai-undone]"); pg.wait_for_timeout(200); pg.uncheck("#aiShowContacted"); pg.wait_for_timeout(200)
    check("undoing 'contacted' puts the customer back", pg.evaluate("Number(document.getElementById('aiListCount').textContent)") == n_before)
    for g in ("u19", "rech", "end", "up"):
        pg.click(f"[data-ai-group={g}]"); pg.wait_for_timeout(150)
    check("every AI group opens", not errs, errs[:3])

    print("3-Month Extension")
    pg.evaluate("closeAllModals()")
    elig = pg.evaluate("DB.customers.map(c=>c.id).find(id=>extensionInfo(id).eligible)")
    early = pg.evaluate("DB.customers.map(c=>c.id).find(id=>{const e=extensionInfo(id); return e.show && !e.eligible;})")
    monthly = pg.evaluate("DB.customers.map(c=>c.id).find(id=>{const a=activeSubscriptionFor(id); return a && a.type==='prepaid' && a.durationDays===30;})")
    check("test data has a customer on day 93+ of a 3-month plan", bool(elig))
    if early:
        pg.evaluate(f"openCustomerDetail('{early}')"); pg.wait_for_timeout(150)
        check("before day 93 the extension button is shown but disabled", pg.is_disabled("#btnExtension"))
    pg.evaluate(f"closeAllModals(); openCustomerDetail('{monthly}')"); pg.wait_for_timeout(150)
    check("monthly-plan customers get no extension button", pg.locator("#btnExtension").count() == 0)
    # no end date: still allowed long after the 3-month plan ended
    lim = pg.evaluate("""(()=>{ const c = DB.customers.find(c=>{const a=activeSubscriptionFor(c.id); return a && a.type==='prepaid' && a.durationDays===90 && extensionInfo(c.id).show;});
        const a = activeSubscriptionFor(c.id), keep = [a.activationDate, a.expiryDate];
        const set = endAgo => { a.expiryDate = addDaysISO(todayISO(), -endAgo); a.activationDate = addDaysISO(a.expiryDate, -90); return extensionInfo(c.id); };
        const r = [set(70).eligible, set(172).eligible, set(400).eligible];
        a.activationDate = keep[0]; a.expiryDate = keep[1]; return r; })()""")
    check("extension has no end date (70, 172, 400 days after the plan ended)", lim == [True, True, True], lim)
    if elig:
        before = pg.evaluate(f"(a=>({{num:a.number, sim:a.simType||'physical'}}))(activeSubscriptionFor('{elig}'))")
        pg.evaluate(f"closeAllModals(); openCustomerDetail('{elig}')"); pg.wait_for_timeout(150)
        pg.click("#btnExtension"); pg.wait_for_timeout(250); pg.click("#savePrepaidAssignBtn"); pg.wait_for_timeout(400)
        after = pg.evaluate(f"(a=>({{num:a.number, sim:a.simType||'physical', days:a.durationDays, tag:(planLengthLabel(a)||[])[0]}}))(activeSubscriptionFor('{elig}'))")
        check("the extension is a new 3-month plan on the same number and SIM type", after == {**before, "days":90, "tag":"ext"}, after)
        # up to 3 extensions per number: age the new plan past day 93 and repeat
        age = f"(a=>{{a.activationDate=addDaysISO(todayISO(),-100); a.expiryDate=addDaysISO(a.activationDate,90);}})(activeSubscriptionFor('{elig}'))"
        counts = []
        for _ in range(2):
            pg.evaluate(age); pg.evaluate(f"closeAllModals(); openCustomerDetail('{elig}')"); pg.wait_for_timeout(150)
            counts.append(pg.locator("#btnExtension .ext-left").text_content() if pg.locator("#btnExtension").count() else None)
            pg.click("#btnExtension"); pg.wait_for_timeout(250); pg.click("#savePrepaidAssignBtn"); pg.wait_for_timeout(400)
        check("the button counts down the extensions left (2/3, then 1/3)", counts == ["2/3", "1/3"], counts)
        pg.evaluate(age); pg.evaluate(f"closeAllModals(); openCustomerDetail('{elig}')"); pg.wait_for_timeout(150)
        check("no 4th extension on the same number", pg.locator("#btnExtension").count() == 0 and not pg.evaluate(f"extensionInfo('{elig}').show"))
        check("used-up extensions are explained on the profile", "all 3 used" in (pg.locator(".ext-closed-note").first.text_content() if pg.locator(".ext-closed-note").count() else ""))

    print("Date typing")
    pg.evaluate("closeAllModals(); openCustomerModal && openCustomerModal()") if pg.evaluate("typeof openCustomerModal==='function'") else None
    dmax = pg.evaluate("[...document.querySelectorAll('input[type=date]')].every(i=>i.max==='9999-12-31')")
    check("every date field jumps from year to month after 4 digits (max year 9999)", dmax)
    pg.evaluate("closeAllModals()")

    print("Prepaid: change plan after it expired (19+)")
    cp = pg.evaluate("""(()=>{ const c = DB.customers.find(c=>{const a=activeSubscriptionFor(c.id); return a && a.type==='prepaid';});
        const a = activeSubscriptionFor(c.id), keep = [c.dob, a.activationDate, a.expiryDate], out = {};
        const btn = () => { closeAllModals(); openCustomerDetail(c.id); const b = document.getElementById('btnChangePrepaidPlan'); return b ? (b.disabled ? 'disabled' : 'on') : 'none'; };
        c.dob = '2000-01-01'; a.activationDate = addDaysISO(todayISO(), 10); a.expiryDate = addDaysISO(todayISO(), 40); out.notExpired = btn();
        a.activationDate = addDaysISO(todayISO(), -40); a.expiryDate = addDaysISO(todayISO(), -10); out.adult = btn();
        c.dob = addDaysISO(todayISO(), -365*17); out.u19 = btn();
        c.dob = ''; out.noDob = btn();
        c.dob = '2000-01-01'; btn();
        document.getElementById('btnChangePrepaidPlan').click();
        out.modal = document.getElementById('prepaidAssignModalOverlay').classList.contains('show') && /Change prepaid plan/.test(document.getElementById('prepaidAssignModalTitle').textContent);
        const tile = document.querySelector('#pa_prepaidPlan_group [data-val="60"]'); if(tile) tile.click();
        return new Promise(r=>setTimeout(()=>{
          document.getElementById('pa_company_group').querySelector('[data-val]')?.click();
          document.getElementById('pa_svcCarrierType_group').querySelector('[data-val]')?.click();
          document.getElementById('savePrepaidAssignBtn').click();
          const n = activeSubscriptionFor(c.id);
          out.saved = [n && n.id!==a.id, n && n.durationDays, a.changeReason, a.isActive];
          out.cid = c.id; r(out); }, 50)); })()""")
    check("no Change plan button while the prepaid plan is still running", cp["notExpired"] == "none", cp)
    check("expired prepaid, 19 or older: Change plan button", cp["adult"] == "on", cp)
    check("under 19 or no date of birth: the button is locked", cp["u19"] == "disabled" and cp["noDob"] == "disabled", cp)
    check("Change plan opens the prepaid plan window", cp["modal"] is True, cp)
    check("saving starts the new prepaid plan (60 days) and ends the expired one", cp["saved"] == [True, 60, "plan_change", False], cp)
    pg.evaluate("closeAllModals()")

    print("Report plan filter")
    rf = pg.evaluate("""(()=>{ const cs = DB.customers.slice(0,3), day = '2031-03-10', ids = [];
        const add = (c, o) => { const s = Object.assign({id: uid('s'), customerId: c.id, isActive:false, activationDate: day, endedAt: day, endedSeq: 1}, o); DB.services.push(s); ids.push(s.id); };
        add(cs[0], {type:'prepaid', durationDays:30, price:36000, sellingPrice:36000, changeReason:'recharge', plan:'R'});
        add(cs[1], {type:'prepaid', durationDays:90, price:99000, sellingPrice:99000, plan:'Q'});
        add(cs[2], {type:'postpaid', durationDays:365, plan:'PLAN A', expectedProfit:100000});
        const keep = repPlanFilter, out = {};
        goTo('reports'); reportView = 'daily'; repSelectedDay = day;
        const run = f => { const pf = document.getElementById('repPlanFilter'); pf.value = f; pf.dispatchEvent(new Event('change'));
          const nPre = document.querySelectorAll('#repDailyPrepaidList .rep-day-row').length, nPost = document.querySelectorAll('#repDailyPostpaidList .rep-day-row').length;
          return [nPre, nPost, document.getElementById('repDailyCards').textContent.replace(/\\s+/g,' ')]; };
        out.all = run('all'); out.norc = run('norc'); out.m3 = run('m3'); out.rc = run('rc'); out.post = run('post');
        out.hl = document.getElementById('repPlanFilter').classList.contains('is-filtered');
        reportView = 'monthly'; repSelectedMonth = '2031-03'; run('norc');
        out.month = document.getElementById('repIncomeCards').textContent.replace(/\\s+/g,' ');
        run('all'); out.monthAll = document.getElementById('repIncomeCards').textContent.replace(/\\s+/g,' ');
        out.saved = localStorage.getItem('himobile_rep_plan');
        DB.services = DB.services.filter(s=>!ids.includes(s.id)); repPlanFilter = keep; localStorage.setItem('himobile_rep_plan', keep);
        reportView = 'monthly'; repSelectedMonth = null; repSelectedDay = null; goTo('dashboard');
        return out; })()""")
    check("All plans: recharge, 3 months and postpaid are all counted", rf["all"][:2] == [2, 1], rf["all"])
    check("Without recharge: the recharge is left out, the rest stays", rf["norc"][:2] == [1, 1] and "99,000" in rf["norc"][2], rf["norc"])
    check("3 months only / Recharge only / Postpaid only", rf["m3"][:2] == [1, 0] and rf["rc"][:2] == [1, 0] and rf["post"][:2] == [0, 1], [rf["m3"], rf["rc"], rf["post"]])
    check("monthly report uses the same filter", "99,000" in rf["month"] and "135,000" in rf["monthAll"], [rf["month"], rf["monthAll"]])
    check("the filter is highlighted when it is not All plans, and remembered", rf["hl"] is True and rf["saved"] == "all", rf)

    print("Profit summary export")
    px = pg.evaluate("""(()=>{ const cs = DB.customers.slice(0,3), day = '2031-04-08', ids = [];
        const add = (c, o) => { const s = Object.assign({id: uid('s'), customerId: c.id, isActive:false, activationDate: day, endedAt: day, endedSeq: 1}, o); DB.services.push(s); ids.push(s.id); };
        add(cs[0], {type:'prepaid', durationDays:30, price:36000, discount:0, sellingPrice:36000, cost:32400, changeReason:'recharge', paymentMethod:'cash'});
        add(cs[1], {type:'prepaid', durationDays:90, price:55000, discount:0, sellingPrice:60000, paymentMethod:'card'});
        add(cs[2], {type:'postpaid', durationDays:365, plan:'PLAN A', expectedProfit:100000, discountPerMonth:5000, discountMonths:2, usimFee:8000});
        const keep = [repPlanFilter, reportView, repSelectedDay, window.XLSX], out = {}, books = [];
        window.XLSX = {utils:{book_new:()=>({s:[]}), aoa_to_sheet:a=>({a}), book_append_sheet:(wb,ws,n)=>wb.s.push([n,ws.a])}, writeFile:(wb,f)=>books.push([f,wb.s])};
        goTo('reports'); repPlanFilter = 'all'; reportView = 'daily'; repSelectedDay = day; renderReports();
        out.btnShown = document.getElementById('btnExportReport').offsetParent !== null;
        document.getElementById('btnExportReport').click(); out.menu = !document.getElementById('repExportMenu').hidden;
        document.querySelector('[data-rep-export="profit"]').click();
        const [file, sheets] = books[0] || [];
        out.file = file; out.sheetNames = (sheets||[]).map(x=>x[0]);
        const sales = (sheets||[]).find(x=>x[0]==='Sales')[1];
        out.header = sales[0].length; out.rows = sales.slice(1, 4).map(r=>[r[4], r[7], r[8], r[9], r[10]]);
        out.total = sales[sales.length-1];
        const sum = (sheets||[]).find(x=>x[0]==='Summary')[1];
        out.note = sum.some(r=>/no cost filled in/.test(String(r[0]||'')));
        window.XLSX = keep[3]; DB.services = DB.services.filter(s=>!ids.includes(s.id));
        repPlanFilter = keep[0]; reportView = keep[1]; repSelectedDay = keep[2]; goTo('dashboard');
        return out; })()""")
    check("export menu: Profit summary, also in Daily view", px["btnShown"] and px["menu"], px)
    check("profit summary has 12 short columns plus a Summary sheet", px["header"] == 12 and px["sheetNames"] == ["Summary", "Sales"] and px["file"] == "Himobile_Profit_2031-04-08.xlsx", px)
    check("recharge 36,000 with cost 32,400 = profit 3,600; card tax 5,000 shown; postpaid 100,000 - 18,000 = 82,000",
          [r[1:] for r in px["rows"]] == [[36000, "", 32400, 3600], [60000, 5000, "", ""], [100000, "", 18000, 82000]] and px["rows"][0][0].startswith("Recharge") and px["rows"][2][0] == "PLAN A", px["rows"])
    check("totals row, and a note when a cost is missing", px["total"][7] == 196000 and px["total"][10] == 85600 and px["note"], px)

    print("Daily closing")
    dc = pg.evaluate("""(async()=>{ const cs = DB.customers.slice(0,6), day = '2020-02-11', ids = [], out = {};
        const add = (c, o) => { const s = Object.assign({id: uid('s'), customerId: c.id, isActive:false, activationDate: day, endedAt: day, endedSeq: 1}, o); DB.services.push(s); ids.push(s.id); };
        add(cs[0], {type:'prepaid', durationDays:90, price:55000, sellingPrice:55000, paymentMethod:'cash'});
        add(cs[1], {type:'prepaid', durationDays:30, price:36000, sellingPrice:36000, paymentMethod:'card', changeReason:'recharge'});
        add(cs[2], {type:'prepaid', durationDays:15, price:20000, sellingPrice:20000, paymentMethod:'bank transfer'});
        add(cs[3], {type:'prepaid', durationDays:30, price:300, sellingPrice:300, paymentMethod:'alipay'});
        add(cs[4], {type:'prepaid', durationDays:60, price:40000, sellingPrice:40000, paymentMethod:''});
        add(cs[5], {type:'postpaid', durationDays:365, plan:'PLAN A', expectedProfit:100000});
        const nSvc = DB.services.length, nCust = DB.customers.length;
        goTo('daily'); dcDay = day; renderDailyClosing();
        const a = dcAuto(day);
        out.auto = [a.d90, a.d60, a.d30, a.rc, a.d15, a.preCount, a.cash, a.transfer, a.card, a.preTotal, a.rmb, a.unpaidN, a.postN, a.postAmt, a.rc36];
        const ev = (el, v, type) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); };
        // other sales: press "Add sale" → pop-up → Screen protector, price, payment → Save
        document.getElementById('dcOpenItem').click();
        out.itemModal = document.getElementById('dcItemModal').classList.contains('show');
        document.querySelector('[data-preset="Screen protector"]').click();
        const am = document.getElementById('dcItemAmt'); am.value = '10000'; am.dispatchEvent(new Event('input', {bubbles:true}));
        document.querySelector('[data-dpay="cash"]').click(); document.getElementById('dcItemAdd').click();
        await new Promise(r=>setTimeout(r, 30));
        out.itemForm = [dcLoad(day).items.length, document.getElementById('dcItemModal').classList.contains('show'), !!document.querySelector('.dc-order.item')];
        // typed by hand and free; no price (not free) isn't saved and the pop-up stays open
        document.getElementById('dcOpenItem').click();
        const nm = document.getElementById('dcItemName'); nm.value = 'Phone case'; nm.dispatchEvent(new Event('input', {bubbles:true}));
        document.querySelector('[data-dpay="free"]').click(); document.getElementById('dcItemAdd').click(); await new Promise(r=>setTimeout(r, 30));
        document.getElementById('dcOpenItem').click(); document.querySelector('[data-dpay="card"]').click(); document.getElementById('dcItemAdd').click();
        out.stayOpen = document.getElementById('dcItemModal').classList.contains('show'); closeAllModals();
        out.itemForm2 = dcLoad(day).items.map(it=>[it.name, it.amount, it.pay]);
        { const d0 = dcLoad(day); d0.items = d0.items.slice(0,1); dcStore(day, d0); renderDailyClosing(); }
        const addTop = (who, amt) => { document.getElementById('dcOpenTop').click(); document.querySelector('[data-draft-who="'+who+'"]').click(); const el = document.getElementById('dcTopAmt'); el.value = amt; el.dispatchEvent(new Event('input', {bubbles:true})); document.getElementById('dcTopAdd').click(); };
        addTop('Jason', '30000'); await new Promise(r=>setTimeout(r, 30));
        out.formCleared = !document.getElementById('dcTopModal').classList.contains('show') && !!document.querySelector('.dc-order [data-repaid="0"]');
        document.querySelector('[data-repaid="0"]').click();
        await new Promise(r=>setTimeout(r, 30));
        ev(document.getElementById('dcDeposit'), '20000'); await new Promise(r=>setTimeout(r, 30));
        ev(document.getElementById('dcCounted'), '15000'); await new Promise(r=>setTimeout(r, 30));
        out.cashDetail = [...document.querySelectorAll('.dc-cashlist .dc-cl:not(.tot):not(.none)')].map(x=> x.querySelector('.sg').textContent + x.querySelector(':scope > b').textContent);
        const c = dcCalc(day, dcLoad(day));
        out.calc = [c.o.spQty, c.o.spCharged, c.topAll, c.topPaid, c.cashExpected, c.diff, c.income];
        out.kpiOk = !!document.querySelector('.dc-cash-state.ok');
        // store money top-up comes out of the drawer straight away; Jihan's not paid back yet is "owed"
        addTop('Store', '5000'); await new Promise(r=>setTimeout(r, 30));
        addTop('Jihan', '7000'); await new Promise(r=>setTimeout(r, 30));
        const nBefore = dcLoad(day).topups.length; document.getElementById('dcOpenTop').click(); document.getElementById('dcTopAdd').click();
        out.noEmpty = dcLoad(day).topups.length === nBefore && document.getElementById('dcTopModal').classList.contains('show'); closeAllModals();
        // yesterday's count is today's starting drawer: yesterday 36,000, today 72,000 counted
        const y = addDaysISO(day, -1), t = day;
        DB.reminderState['daily:'+y] = JSON.stringify({items:[], topups:[], deposit:0, counted:36000, note:''});
        const keepT = DB.reminderState['daily:'+t];
        const tmp = Object.assign(dcLoad(t), {counted: 72000}); DB.reminderState['daily:'+t] = JSON.stringify(tmp);
        const cy = dcCalc(t, dcLoad(t)); out.yday = [cy.start, cy.prev && cy.prev.day===y, cy.grew, cy.cashExpected - cy.start === cy.cashToday];
        renderDailyClosing(); out.compare = !!document.querySelector('.dc-compare') && /Drawer went up today/.test(document.querySelector('.dc-compare').textContent) && /[+]₩36,000/.test(document.querySelector('.dc-compare').textContent);
        DB.reminderState['daily:'+t] = keepT; delete DB.reminderState['daily:'+y]; renderDailyClosing();
        const c2 = dcCalc(day, dcLoad(day)); out.who = [c2.topStore, c2.topOwed, c2.cashExpected, dcLoad(day).topups.map(dcWho)];
        out.short = /Over by ₩5,000/.test(document.querySelector('.dc-cash-state').textContent);
        out.stored = !!DB.reminderState['daily:'+day];
        out.untouched = DB.services.length===nSvc && DB.customers.length===nCust;
        out.monthRow = !!document.querySelector('[data-dc-day="'+day+'"]');
        const keepX = window.XLSX, books = [];
        window.XLSX = {utils:{book_new:()=>({s:[]}), aoa_to_sheet:a=>({a}), book_append_sheet:(wb,ws,n)=>wb.s.push([n,ws.a])}, writeFile:(wb,f)=>books.push([f,wb.s])};
        document.getElementById('dcExport').click(); window.XLSX = keepX;
        const sh = books[0] && books[0][1][0][1];
        out.export = sh ? [books[0][0], sh[0][1], sh[1][1], sh.find(r=>r[0]===day)] : null;
        // a day with only unpaid 1-month plans (like Nov 13) still shows in the month table, with plans and 'Not paid'
        const d3 = addDaysISO(day, -3); add(cs[0], {type:'prepaid', durationDays:30, price:30000, sellingPrice:30000, paymentMethod:'', activationDate:d3}); add(cs[1], {type:'prepaid', durationDays:30, price:30000, sellingPrice:30000, paymentMethod:'', activationDate:d3});
        renderDailyClosing(); const r3 = document.querySelector('[data-dc-day="'+d3+'"]');
        out.unpaidDay = !!r3 && /Not paid/.test(document.querySelector("#dcMonthCard thead").textContent) && /60,000/.test(r3.textContent) && /90.*60.*30.*Recharge.*Postpaid/.test(document.querySelector("#dcMonthCard thead").textContent);
        window.scrollTo(0, document.body.scrollHeight); const y0 = window.scrollY; r3.click();
        out.noJump = dcDay===d3 && (y0===0 || window.scrollY > 0);
        DB.services = DB.services.filter(s=>!ids.includes(s.id)); delete DB.reminderState['daily:'+day]; goTo('dashboard');
        return out; })()""")
    check("Daily closing counts the day from the CRM: 90/60 days, 1 month and recharge separately, 15 days, cash, transfer, card, RMB, unpaid, postpaid, recharge 36",
          dc["auto"] == [1, 1, 1, 1, 1, 5, 55000, 20000, 36000, 111000, 300, 1, 1, 100000, 1], dc["auto"])
    check("screen protector, staff top-up paid back, deposit: cash in drawer 55,000+10,000-30,000-20,000 = 15,000 and it matches",
          dc["calc"] == [1, 10000, 30000, 30000, 15000, 0, 221000] and dc["kpiOk"], dc["calc"])
    check("top-ups by Jason / Jihan / Store money: store money leaves the drawer, unpaid staff top-ups show as owed",
          dc["who"] == [5000, 7000, 10000, ["Jason", "Store", "Jihan"]] and dc["short"], dc["who"])
    check("yesterday's count (36,000) is today's start; counted 72,000 shows the drawer went up +36,000, compared with today's cash", dc["yday"] == [36000, True, 36000, True] and dc["compare"], [dc["yday"], dc["compare"]])
    check("other sales: Add sale opens a pop-up; Screen protector, price, payment, Save closes it and the sale is listed",
          dc["itemModal"] and dc["itemForm"] == [1, False, True], [dc["itemModal"], dc["itemForm"]])
    check("an item can be typed by hand and given free; no price means it isn't added",
          dc["itemForm2"] == [["Screen protector", 10000, "cash"], ["Phone case", 0, "free"]] and dc["stayOpen"], dc["itemForm2"])
    check("today's cash one by one: the 90-day cash sale, the screen protector, the top-up paid back, the deposit",
          dc["cashDetail"] == ["+₩55,000", "+₩10,000", "−₩30,000", "−₩20,000"], dc["cashDetail"])
    check("days with only unpaid plans still show in the month table (Plans + Not paid)", dc["unpaidDay"], dc)
    check("clicking a day in the table opens it without jumping to the top", dc["noJump"], dc)
    check("top-up: Add top-up opens a pop-up; who + amount + Save closes it and lists it; empty amount isn't saved", dc["formCleared"] and dc["noEmpty"], dc)
    check("typed-in daily entries are saved apart from customers and plans", dc["stored"] and dc["untouched"] and dc["monthRow"], dc)
    check("month export has the old sheet's layout (先付办理数量 / 90天 ...)", dc["export"] and dc["export"][0] == "Himobile_Daily_2020-02.xlsx" and dc["export"][1] == "先付办理数量" and dc["export"][2] == "90天" and dc["export"][3][1] == 1, dc["export"])

    print("Payment method starts blank")
    pm = pg.evaluate("""(()=>{ const c = DB.customers.find(c=>{const a=activeSubscriptionFor(c.id); return a && a.type==='prepaid';});
        const a = activeSubscriptionFor(c.id), keep = a.paymentMethod, out = {}; a.paymentMethod = 'card';
        closeAllModals(); openPrepaidAssignModal(c.id, 'recharge');
        const g = document.getElementById('pa_paymentMethod_group');
        out.rechargeStart = [g.dataset.selected, !!g.querySelector('.tile-blank.selected')];
        g.querySelector('[data-val="cash"]').click(); g.querySelector('.tile-blank').click();
        out.backToBlank = [g.dataset.selected, g.querySelector('.tile-blank').classList.contains('selected')];
        closeAllModals();
        // editing a plan: the saved method is shown, and can be set back to blank
        openCustomerModal(c);
        const g3 = document.getElementById('p3_paymentMethod_group');
        out.editShows = g3 ? g3.dataset.selected : null;
        closeAllModals(); a.paymentMethod = keep;
        return out; })()""")
    check("recharge / change plan / extension start with payment method blank (Not paid yet)", pm["rechargeStart"] == ["", True], pm)
    check("a chosen method can be set back to blank", pm["backToBlank"] == ["", True], pm)

    print("Search with dashes in the phone number")
    sr = pg.evaluate("""(()=>{ const c = DB.customers.find(c=>c.phone && searchDigits(c.phone).length>=10 && activeSubscriptionFor(c.id)); const d = searchDigits(c.phone);
        const dash = d.slice(0,3)+'-'+d.slice(3,d.length-4)+'-'+d.slice(-4), sp = dash.replace(/-/g,' '), intl = '+82 '+d.slice(1,3)+'-'+d.slice(3,d.length-4)+'-'+d.slice(-4);
        const hits = [dash, sp, intl, d, d.slice(-4), dash.slice(4)].map(q=>customerSearchHit(c, q, activeSubscriptionFor(c.id)));
        const keep = c.phone; c.phone = dash; const savedDash = customerSearchHit(c, d, null); c.phone = keep;
        const out = {hits, savedDash, miss: customerSearchHit(c, '999-9999-9999', null), name: customerSearchHit(c, (c.name||'').slice(0,3), null)};
        // dashboard quick search and Sheet View use it
        goTo('dashboard'); const dq = document.getElementById('dashQuickSearch'); dq.value = dash; dq.dispatchEvent(new Event('input'));
        out.dash = !!document.querySelector('#dashQuickSearchResults [data-open-customer="'+c.id+'"]'); dq.value=''; dq.dispatchEvent(new Event('input'));
        const a = activeSubscriptionFor(c.id), keepTab = sheetTypeTab; sheetTypeTab = a.type; goTo('sheet');
        const ss = document.getElementById('sheetSearch'); ss.value = dash; ss.dispatchEvent(new Event('input'));
        out.sheet = document.getElementById('page-sheet').textContent.includes(c.name); ss.value=''; sheetTypeTab = keepTab; ss.dispatchEvent(new Event('input')); goTo('dashboard');
        return out; })()""")
    check("010-1234-5678, 010 1234 5678, +82 10-..., plain digits and parts of the number all match", all(sr["hits"]) and sr["savedDash"], sr)
    check("a different number or the name still works as before", sr["miss"] is False and sr["name"] is True, sr)
    check("dashboard quick search finds the customer by a dashed number", sr["dash"] is True, sr)
    check("Sheet View search finds the customer by a dashed number", sr["sheet"] is True, sr)

    print("Age check")
    ag = pg.evaluate("""(()=>{ const out = {};
        out.parse = ['2007-05-12','20070512','070512','0705124123456','990101','2007.5.12','hello','2030-01-01'].map(parseBirthInput);
        const u = addDaysISO(todayISO(), -365*17);   // about 17 years old
        document.getElementById('btnAgeCheck').click();
        out.open = document.getElementById('ageCheckModalOverlay').classList.contains('show');
        const inp = document.getElementById('ageCheckInput'); inp.value = u; inp.dispatchEvent(new Event('input'));
        const r = document.getElementById('ageCheckResult');
        out.u19 = [!!r.querySelector('.age-card.warn'), /Turns 19 on/.test(r.textContent), /In about/.test(r.textContent)];
        out.t19 = birthdayOn(u, 19);
        inp.value = '2000-01-01'; inp.dispatchEvent(new Event('input'));
        out.adult = [!!r.querySelector('.age-card.ok'), /19 or older/.test(r.textContent)];
        out.diff = calDiffText(calDiff('2026-11-24','2028-01-30'));
        closeAllModals(); return out; })()""")
    check("reads 2007-05-12, 20070512, 070512, a full ID number, 1999 dates; rejects junk and future dates",
          ag["parse"] == ["2007-05-12","2007-05-12","2007-05-12","2007-05-12","1999-01-01","2007-05-12",None,None], ag["parse"])
    check("Age check opens from the top bar", ag["open"] is True, ag)
    check("under 19: shows the day they turn 19 and how long until then", ag["u19"] == [True, True, True], ag)
    check("19 or older is shown in green", ag["adult"] == [True, True], ag)
    check("time left reads as years, months, days", ag["diff"] == "1 year 2 months 6 days", ag["diff"])

    print("Years in Korea counts down")
    st = pg.evaluate("""(()=>{ const c = DB.customers.find(c=>activeSubscriptionFor(c.id)); const keep = [c.years, DB.reminderState[stayKey(c.id)]];
        const ago = d => addDaysISO(todayISO(), -d), out = {};
        c.years = 5/12; DB.reminderState[stayKey(c.id)] = ago(0)+'|'+c.years; out.today = stayLeftText(c);
        DB.reminderState[stayKey(c.id)] = ago(61)+'|'+c.years; out.after2mo = stayLeftText(c);
        DB.reminderState[stayKey(c.id)] = ago(160)+'|'+c.years; out.after5mo = [stayLeft(c), stayLeftText(c)];
        c.years = 1.5; DB.reminderState[stayKey(c.id)] = ago(0)+'|1.5'; out.y15 = stayLeftText(c);
        // value typed in Sheet View restarts the countdown today
        DB.reminderState[stayKey(c.id)] = ago(365)+'|1.5'; out.sheetBefore = stayLeftRounded(c);
        sheetCommitEdit('customer', c.id, 'years', 2); out.sheetAfter = [c.years, DB.reminderState[stayKey(c.id)] === todayISO()+'|2'];
        // the edit form shows the time left and leaves the countdown alone when untouched
        DB.reminderState[stayKey(c.id)] = ago(183)+'|2';
        closeAllModals(); openCustomerModal(c); out.form = document.getElementById('f_years').value;
        closeAllModals();
        c.years = keep[0]; if(keep[1]===undefined) delete DB.reminderState[stayKey(c.id)]; else DB.reminderState[stayKey(c.id)] = keep[1];
        return out; })()""")
    check("5 months entered today shows 5 mo, 3 mo after 2 months, 0 after 5 months",
          st["today"] == "5 mo" and st["after2mo"] == "3 mo" and st["after5mo"] == [0, "0 (stay ended)"], st)
    check("1.5 years shows as 1 yr 6 mo", st["y15"] == "1 yr 6 mo", st)
    check("a new value typed in Sheet View restarts the countdown", st["sheetBefore"] == 0.5 and st["sheetAfter"] == [2, True], st)
    check("the edit form shows the time left (2 yrs half a year ago -> 1.5)", st["form"] == "1.5", st)

    print("Reprint information change")
    rp = pg.evaluate("""(()=>{ const c = DB.customers.find(c=>activeSubscriptionFor(c.id) && activeSubscriptionFor(c.id).type==='prepaid');
        const keep = [c.idChangeRequest, c.idType], orig = window.printIdChangeForm, calls = [];
        c.idChangeRequest = {status:'completed', requestedDate:'2026-10-01', completedDate:'2026-10-05', handledBy:'Test'};
        window.printIdChangeForm = id => calls.push(id);
        closeAllModals(); openCustomerDetail(c.id);
        const top = document.getElementById('btnReprintIdChange'), hist = document.querySelector('#detailBody [data-idchange-reprint]');
        if(top) top.click(); if(hist) hist.click();
        window.printIdChangeForm = orig; c.idChangeRequest = keep[0]; c.idType = keep[1]; closeAllModals();
        return [!!top, !!hist, calls.length===2 && calls.every(x=>x===c.id)]; })()""")
    check("a completed info change has Reprint buttons (actions + history) that print it", rp == [True, True, True], rp)

    print("Sheet View")
    pg.evaluate("closeAllModals(); goTo('sheet')"); pg.wait_for_timeout(300)
    total = pg.evaluate("document.querySelectorAll('#sheetTable tbody tr [data-open-customer]').length")
    pg.select_option("#sheetSortOrder", "u19"); pg.wait_for_timeout(300)
    u19 = pg.evaluate("document.getElementById('sheetCount').textContent")
    # Sheet View opens on the Prepaid tab
    prepaid_ids = {x["customerId"] for x in seed["services"] if x["type"] == "prepaid" and x["isActive"]}
    want = sum(1 for c in seed["customers"] if c["dob"] == "2009-05-01" and c["id"] in prepaid_ids)
    check("Sheet View lists customers", total > 0, total)
    check("under-19 view finds exactly the under-19 customers", u19.startswith(str(want) + " "), (u19, want))
    pg.select_option("#sheetSortOrder", index=0); pg.wait_for_timeout(200)

    n1 = pg.evaluate("[DB.customers.length, DB.services.length]")
    have = pg.evaluate("[DB.customers.map(c=>c.id), DB.services.map(s=>s.id)]")
    check("no customer or plan was lost", ids(seed["customers"]) <= set(have[0]) and ids(seed["services"]) <= set(have[1]), (n0, n1))
    check("no script errors during all of the above", not errs, errs[:3])
    ctx.close()

    print("Sync with the server")
    api_seed(seed)
    ctx, pg, errs = open_app(b, seed, server=True)
    check("everything downloads from the server", pg.evaluate("DB.customers.length") == len(seed["customers"]), pg.evaluate("DB.customers.length"))
    pg.evaluate("closeAllModals(); openCustomerModal(getCustomer('c2'))"); pg.wait_for_timeout(300)
    pg.fill("#f_notes", "synced note"); pg.click("#saveCustomerBtn"); pg.wait_for_timeout(500)
    pg.evaluate("closeAllModals(); deleteCustomerById('c3')"); pg.wait_for_timeout(500)
    pg.evaluate("pushToServer()"); pg.wait_for_timeout(2000)
    st = api_state()
    srv_c = {c["id"]: c for c in st["customers"]}
    check("an edit reaches the server", srv_c.get("c2", {}).get("notes") == "synced note", srv_c.get("c2", {}).get("notes"))
    check("a deleted customer is deleted on the server", "c3" not in srv_c)
    check("every other customer is still on the server", ids(seed["customers"]) - {"c3"} <= set(srv_c), len(srv_c))
    check("plans on the server untouched (except the deleted customer's)",
          {s["id"] for s in seed["services"] if s["customerId"] != "c3"} <= {s["id"] for s in st["services"]})
    blank_pay = [s["id"] for s in st["services"] if s["id"] in ids(seed["services"]) and s.get("paymentMethod") == "cash"
                 and not next(x for x in seed["services"] if x["id"] == s["id"]).get("paymentMethod")]
    check("blank payment methods stay blank on the server", not blank_pay, blank_pay[:5])
    pg.evaluate("pullFromServer()"); pg.wait_for_timeout(1500)
    check("deleted customer does not come back after a refresh", pg.evaluate("!getCustomer('c3')"))

    print("Undo")
    snap = lambda cid: pg.evaluate(f"JSON.stringify([getCustomer('{cid}'), customerServices('{cid}').map(x=>JSON.stringify(x)).sort()])")
    def srv_snap(cid):
        st = api_state(); c = next((x for x in st["customers"] if x["id"] == cid), None)
        return [c, sorted(json.dumps(x, sort_keys=True) for x in st["services"] if x["customerId"] == cid)]
    # cancel subscription -> undo
    b4, sb4 = snap("c4"), srv_snap("c4")
    pg.evaluate("closeAllModals(); openCustomerDetail('c4')"); pg.wait_for_timeout(200)
    if not pg.is_visible("#btnCancelSub"): pg.click("#detailBody .pf-more")   # postpaid: under "More"
    if not pg.is_visible("#btnCancelSub"): pg.click("#detailBody .pf-more")
    pg.click("#btnCancelSub"); pg.wait_for_timeout(200); pg.click("#confirmCancelSubBtn"); pg.wait_for_timeout(400)
    check("cancelling a subscription shows an Undo button", pg.evaluate("document.getElementById('undoBar')?.classList.contains('show')"))
    check("cancel really ended the plan", pg.evaluate("!activeSubscriptionFor('c4')"))
    pg.evaluate("pushToServer()"); pg.wait_for_timeout(1200)
    pg.click("#undoBar .undo-btn"); pg.wait_for_timeout(500)
    check("Undo puts the cancelled plan back exactly", snap("c4") == b4)
    pg.evaluate("pushToServer()"); pg.wait_for_timeout(1500)
    check("...and on the server too", srv_snap("c4") == sb4)
    # cancel -> close the bar -> sync -> the profile still offers an exact undo
    b9, sb9 = snap("c9"), srv_snap("c9")
    pg.evaluate("closeAllModals(); openCustomerDetail('c9')"); pg.wait_for_timeout(200)
    if not pg.is_visible("#btnCancelSub"): pg.click("#detailBody .pf-more")
    pg.click("#btnCancelSub"); pg.wait_for_timeout(200); pg.click("#confirmCancelSubBtn"); pg.wait_for_timeout(400)
    pg.wait_for_timeout(1500)
    check("the Undo bar does not disappear by itself", pg.evaluate("document.getElementById('undoBar').classList.contains('show')"))
    pg.click("#undoBar .undo-x"); pg.evaluate("pushToServer()"); pg.wait_for_timeout(1500); pg.evaluate("pullFromServer()"); pg.wait_for_timeout(1500)
    pg.evaluate("closeAllModals(); openCustomerDetail('c9')"); pg.wait_for_timeout(300)
    check("the profile keeps an 'Undo cancellation' button (after closing the bar and a sync)", pg.is_visible("#btnUndoCancelExact"))
    pg.click("#btnUndoCancelExact"); pg.wait_for_timeout(600)
    check("that button puts the plan back exactly", snap("c9") == b9)
    check("...and then goes away", not pg.is_visible("#btnUndoCancelExact"))
    pg.evaluate("pushToServer()"); pg.wait_for_timeout(1500)
    check("...and the server has the plan back exactly", srv_snap("c9") == sb9)
    # cancelled on another PC (no local undo kept), plan already past its end date:
    # "Undo cancellation" still shows and puts the plan back with its own dates, not from today
    pg.evaluate("""(()=>{ const a = activeSubscriptionFor('c9'); a.activationDate = addDaysISO(todayISO(), -120); a.expiryDate = addDaysISO(a.activationDate, 90); a.changeReason = 'recharge'; saveDB(DB); })()""")
    b9b = pg.evaluate("customerServices('c9').map(x=>{const o={}; Object.keys(x).sort().forEach(k=>{ if(x[k]!==null && x[k]!==undefined && x[k]!=='') o[k]=x[k]; }); return JSON.stringify(o);}).sort().join('\\n')")
    pg.evaluate("closeAllModals(); openCustomerDetail('c9')"); pg.wait_for_timeout(200)
    if not pg.is_visible("#btnCancelSub"): pg.click("#detailBody .pf-more")
    pg.click("#btnCancelSub"); pg.wait_for_timeout(200); pg.fill("#cs_cancelNotes", "wrong person"); pg.click("#confirmCancelSubBtn"); pg.wait_for_timeout(400)
    pg.evaluate("localStorage.removeItem('himobile_cancel_undo'); hideUndo(); pushToServer()"); pg.wait_for_timeout(1500)
    pg.evaluate("pullFromServer()"); pg.wait_for_timeout(1500)
    pg.evaluate("closeAllModals(); openCustomerDetail('c9')"); pg.wait_for_timeout(300)
    check("'Undo cancellation' shows even without this PC's undo history", pg.is_visible("#btnUndoCancelKeep") and not pg.is_visible("#btnUndoCancel"))
    pg.click("#btnUndoCancelKeep"); pg.wait_for_timeout(600)
    def plan_state(cid):   # blank, null and missing count as the same
        return pg.evaluate(f"customerServices('{cid}').map(x=>{{const o={{}}; Object.keys(x).sort().forEach(k=>{{ if(x[k]!==null && x[k]!==undefined && x[k]!=='') o[k]=x[k]; }}); return JSON.stringify(o);}}).sort().join('\\n')")
    a9 = plan_state("c9")
    check("...and puts the plan back as on the cancel day (same dates, reason and notes)", a9 == b9b)

    # delete customer -> undo
    b8, sb8 = snap("c8"), srv_snap("c8")
    pg.evaluate("closeAllModals(); deleteCustomerById('c8')"); pg.wait_for_timeout(1200)
    check("delete removed the customer on the server", srv_snap("c8")[0] is None)
    pg.click("#undoBar .undo-btn"); pg.wait_for_timeout(500)
    check("Undo brings a deleted customer back with all plans", snap("c8") == b8)
    pg.evaluate("pushToServer()"); pg.wait_for_timeout(1500)
    check("...and on the server too", srv_snap("c8") == sb8)
    pg.evaluate("pullFromServer()"); pg.wait_for_timeout(1500)
    check("...and it stays after a refresh", snap("c8") == b8)
    # merge -> undo
    b6, bd = snap("c6"), snap("c_dup")
    pg.evaluate("closeAllModals(); mergeDuplicateGroup(['c_dup','c6'])"); pg.wait_for_timeout(1200)
    check("merge folded the duplicate", pg.evaluate("!getCustomer('c6')"))
    pg.click("#undoBar .undo-btn"); pg.wait_for_timeout(500)
    check("Undo splits a merge back into both customers", snap("c6") == b6 and snap("c_dup") == bd)
    pg.evaluate("pushToServer()"); pg.wait_for_timeout(1500)
    check("...and on the server too", srv_snap("c6")[0] is not None and len(srv_snap("c6")[1]) == len(json.loads(b6)[1]))
    check("no script errors while syncing", not errs, errs[:3])
    ctx.close()

def main():
    srv, mock = start_servers()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
            try: run(b)
            except Exception:
                traceback.print_exc(); RESULTS.append(("test run crashed", False, ""))
            b.close()
    finally:
        mock.terminate(); srv.shutdown()
    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
