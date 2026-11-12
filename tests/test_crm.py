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
    pg.click("#saveCustomerBtn"); pg.wait_for_timeout(700)
    r = pg.evaluate("""(()=>{const c=DB.customers.find(c=>c.name==='CI NEW PREPAID'); if(!c) return null; const s=activeSubscriptionFor(c.id);
        return {phone:c.phone, num:s&&s.number, type:s&&s.type, dur:s&&s.durationDays, pay:s?(s.paymentMethod||''):null}})()""")
    check("new prepaid customer is saved with its plan", r and r["type"] == "prepaid" and r["num"] == "010-7777-0001", r)
    check("payment method is blank unless chosen", r and r["pay"] == "", r)

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
