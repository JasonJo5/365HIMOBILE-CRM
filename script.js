/* =========================================================
   365Himobile CRM — single-file vanilla JS application
   Data persisted to localStorage. Bilingual ZH / EN.
   ========================================================= */

// Surfaces any unexpected JavaScript error directly on screen — a modal that silently
// fails to open (an error partway through, after something else already closed) otherwise
// leaves no clue behind for someone who can't easily check the browser console themselves.
// This makes that error visible and reportable without needing dev tools at all.
window.addEventListener('error', e=>{
  const msg = `Error: ${e.message}\nFile: ${(e.filename||'').split('/').pop()}\nLine: ${e.lineno}`;
  console.error('Uncaught error:', e.error);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;max-width:520px;margin:0 auto;background:#2A0E0E;color:#FFD9D9;padding:14px 16px;border-radius:10px;font:12px/1.5 monospace;white-space:pre-wrap;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.3);';
  box.textContent = msg + '\n\n(Tap to dismiss — please screenshot this first)';
  box.addEventListener('click', ()=> box.remove());
  document.body.appendChild(box);
});

/* The built-in Preeti form image now lives in its own file (preeti-template.jpg, ~290 KB)
   instead of being embedded here as ~395 KB of base64 text that every computer downloaded
   on every load. It's only needed the first time the built-in template is created (fresh
   browser / fresh install) — every existing setup already has it saved with its data. */
const PREETI_TEMPLATE_IMAGE_URL = 'preeti-template.jpg?v=1';


const DB_KEY = 'himobile_crm_v1';
// declared early (before loadDB/saveDB run) since saveDB() can be called immediately during
// the very first load (seeding fresh data) — these must exist before that happens
const SERVER_URL_KEY = 'himobile_server_url';
const SYNC_ENABLED_KEY = 'himobile_sync_enabled';
const LAST_SYNC_KEY = 'himobile_last_sync';
const API_KEY_STORAGE_KEY = 'himobile_api_key';
const UNLOCKED_KEY = 'himobile_unlocked'; // persists "stay unlocked" across refreshes until Log out
// The store's real server address, baked in as the default so a brand-new browser (a laptop
// opening the GitHub Pages link for the first time, on the store's WiFi) starts syncing
// immediately with zero setup. Overridable (or turn-off-able) via Import/Export settings.
let syncTimer = null; // debounce handle for scheduleServerSync() — declared early for the same reason as above
let pushPending = false; // a push is scheduled (timer running) but hasn't been sent yet
let pushInFlight = false; // a push request is actually in progress right now
const LANG_KEY = 'himobile_crm_lang';

/* ---------------- i18n ---------------- */
const I18N = {
  zh: {
    'sidebar.sub':'客户管理系统 · 고객 관리','sidebar.store':'韩国手机店','sidebar.staffSub':'点击切换办理人',
    'nav.dashboard':'工作台','nav.customers':'客户档案','nav.sheet':'表格视图','nav.ai':'AI 商业洞察','nav.reminders':'到期跟进','nav.orders':'业务订单','nav.reports':'报表分析','nav.templates':'打印模板','nav.io':'导入导出',
    'sub.sheet':'像表格一样直接编辑客户与套餐信息',
    'sheet.hint':'💡 点击彩色标签可直接选择新值；点击文字/数字/日期可直接编辑，回车或点击其他地方即保存',
    'sub.dashboard':'门店运营总览','sub.customers':'客户资料与套餐管理','sub.ai':'找出适合转后付、需要续费、或适合升级合约的客户','sub.reminders':'到期、合同与信息变更提醒','sub.orders':'先付、后付、号码移动等业务记录','sub.reports':'营收、利润与客户结构报表','sub.templates':'运营商申请表自动填写与打印','sub.io':'Excel 导入与数据备份',
    'btn.newCustomer':'新建客户','btn.exportExcel':'导出 Excel','btn.exportMonthExcel':'导出该月份 Excel','btn.addFollowup':'＋ 添加跟进','btn.newOrder':'＋ 新增业务','btn.cancel':'取消','btn.saveCustomer':'保存客户','btn.saveOrder':'保存业务','btn.edit':'编辑资料','btn.addService':'＋ 新增业务','btn.confirmImport':'确认导入','btn.view':'查看','btn.complete':'完成','btn.followUpAgain':'再次跟进','btn.delete':'删除','btn.deleteCustomer':'删除客户','btn.saveTemplate':'保存模板','btn.print':'打印','btn.savePrint':'保存并打印申请表','btn.merge':'合并','btn.copyName':'复制姓名','btn.save':'保存','btn.requestIdChange':'信息变更','btn.markComplete':'标记已完成','btn.freezeSim':'暂停卡号','btn.unfreezeSim':'解除暂停',
    'freeze.modalTitle':'暂停卡号（Freeze SIM）','freeze.modalDesc':'暂停期间不计入合约期限，合约到期日将顺延相应天数。仅限后付卡客户使用。','freeze.byDays':'按天数','freeze.byRange':'按日期范围','freeze.startDate':'开始日期','freeze.endDate':'结束日期','freeze.days':'暂停天数','freeze.frozen':'暂停中','freeze.colHeader':'暂停状态','freeze.clickToUnfreeze':'点击解除暂停',
    'btn.changeToPostpaid':'转为后付卡','btn.changePlan':'变更套餐','btn.cancelSubscription':'取消订阅','btn.startNewSubscription':'开通新订阅','btn.confirmChange':'确认变更','btn.confirmCancel':'确认取消订阅','btn.back':'返回','btn.undoCancel':'恢复订阅 Reactivate',
    'btn.recharge':'充值续约','btn.changeToPrepaid':'转为先付卡','btn.confirmRecharge':'确认充值',
    'dash.greeting':'早上好，店长','dash.followup.title':'今天要跟进','dash.followup.desc':'优先联系即将到期的客户','dash.viewall':'查看全部 →','dash.overview.title':'业务概览','dash.overview.desc':'本月开通类型','dash.recent.title':'最近新增客户','dash.recent.desc':'快速确认新开的号码与套餐','dash.customerlist':'客户列表 →','dash.nationality.title':'客户国籍分布','dash.referral.title':'客户来源分布','dash.paymentToday.title':'今日付款方式汇总（先付）','dash.paymentToday.desc':'今日各付款方式的客户数与收入合计',
    'dash.quickSearch':'🔍 快速搜索客户姓名、号码或证件号...','dash.noMatches':'没有找到匹配的客户','dash.dupeBanner':'发现 {groups} 组重复客户（共 {n} 位），建议检查并合并','dash.dupeBannerBtn':'立即查看','dash.renewals.title':'合约即将到期（30天内）','dash.renewals.desc':'后付卡合约即将到期，建议提前联系续约','dash.renewals.emptyTitle':'近期没有合约到期 👍','dash.renewals.emptyDesc':'未来30天内没有后付卡合约到期','dash.winback.title':'流失客户 / 待挽回','dash.winback.desc':'已取消订阅、尚未重新开通的客户','dash.winback.emptyTitle':'暂无流失客户','dash.winback.emptyDesc':'所有曾经订阅过的客户目前都有有效订阅','dash.revenueTrend.title':'营收趋势（近6个月）','dash.cancelReasons.title':'取消原因分布','dash.noCancellations':'近6个月内没有取消记录 👍',
    'stat.totalCustomers':'客户总数','stat.newThisMonth':'本月新开通','stat.followup7':'7天内需跟进','stat.revenueMonth':'本月实收','stat.fromRecords':'来自现有先付 / 后付记录','stat.vsLastMonth':'较上月','stat.includesExpiry':'包含到期与首月入账','stat.expiringSoon':'即将到期客户','stat.infoChangeNeeded':'需信息变更客户',
    'stat.activePrepaid':'当前先付卡客户','stat.activePostpaid':'当前后付卡客户','stat.activeBook':'目前有效订阅','stat.outstanding':'未收总额','stat.outstandingSub':'所有有效及近期订单','stat.renewalsSoon':'即将到期合约','stat.renewalsSub':'30天内到期（后付卡）','stat.newActivity':'较上月新增',
    'col.customer':'客户','col.number':'号码','col.service':'业务','col.carrier':'通信社','col.activated':'开通日期','col.status':'状态','col.contact':'联系方式','col.phoneNumber':'电话号码','col.nationality':'国籍','col.id':'证件','col.subType':'开通方式','col.currentNumber':'当前号码','col.recentActivity':'最近业务','col.rating':'评分','col.serviceType':'业务类型','col.plan':'套餐','col.amount':'金额','col.outstanding':'欠款','col.month':'月份','col.orders':'订单数','col.revenue':'营收','col.cost':'成本','col.profit':'利润','col.outstandingTotal':'未收合计','col.dupeReason':'重复原因','col.contractStatus':'合约状态',
    'dupe.reasonName':'姓名相同','dupe.reasonPhone':'电话相同',
    'col.expectedProfit':'预期利润','col.actualProfit':'实际利润（已核对）','col.variance':'差异','col.discountGiven':'折扣总额','col.netExpected':'净预期利润',
    'custtab.all':'全部客户','custtab.prepaid':'先付卡客户','custtab.postpaid':'后付卡客户','custtab.inactive':'已停用客户','custtab.dupes':'重复客户',
    'ph.search':'搜索姓名、号码、国籍或证件号',
    'filter.allNationalities':'全部国籍','filter.allRatings':'全部评分','filter.allTypes':'全部业务类型','filter.allStatus':'全部状态',
    'filter.allDurations':'开通时长：不限','filter.duration6':'已开通 6 个月以上','filter.duration8':'已开通 8 个月以上','filter.duration12':'已开通 1 年以上','col.activeFor':'开通时长',
    'filter.allTime':'添加时间：不限','filter.today':'今天新增','filter.last7':'最近7天','filter.thisMonth':'本月','filter.last30':'最近30天','col.dateAdded':'添加日期','filter.activationDateRange':'开通日期范围','filter.clearDates':'清除日期','filter.activationDateFrom':'开通日期起','filter.activationDateTo':'开通日期止',
    'sort.newest':'排序：最新优先','sort.oldest':'排序：最旧优先','sort.nameAsc':'姓名 A → Z','sort.nameDesc':'姓名 Z → A','sort.ratingHigh':'评分：高到低','sort.ratingLow':'评分：低到高',
    'modal.newCustomer':'新建客户','modal.editCustomer':'编辑客户','modal.customerProfile':'客户档案','modal.newOrder':'新增业务','modal.editOrder':'编辑业务','modal.importPreview':'导入预览','modal.changeToPostpaid':'转为后付卡','modal.changePlan':'变更套餐','modal.cancelSubscription':'取消订阅',
    'cs.autofillHint':'姓名 / 电话 / 国籍 / 职业 / 证件号码已根据现有客户资料自动填写，可直接修改','cs.idNumberArc':'证件号码 (ARC)',
    'modal.chooseType':'新建客户','modal.chooseTypeDesc':'先选择客户类型，两种表单的字段不同','modal.prepaidDesc':'固定3个月充值套餐','modal.postpaidDesc':'按月合约，可选运营商与套餐','modal.newPostpaidCustomer':'新建后付卡客户',
    'f.contactHandle':'联系账号 / ID','f.workType':'业务向','f.handlerName':'办理人','f.referralFriend':'介绍人（朋友姓名）','f.date':'日期',
    'f.profitSection':'公司价格与折扣','f.expectedProfit':'公司价格','f.actualProfit':'公司实际结算价','f.usimFee':'USIM 费用','f.discountPerMonth':'每月折扣','f.discountMonths':'折扣月数','f.netExpectedProfit':'预期收入','f.expectedIncome':'预期收入','f.actualIncome':'实际收入','f.discountTotal':'折扣总额','f.actualProfitHint':'💡「公司实际结算价」会在月底运营商结算后填写，用于计算实际收入并与预期收入核对 — 可在保存客户后于「表格视图」中随时补填。',
    'f.name':'客户姓名','f.phone':'联系电话','f.nationality':'国籍','f.nationalityPh':'例如：CHINA / VIETNAM','f.dob':'出生日期','f.kakao':'KakaoTalk ID','f.wechat':'微信 WeChat','f.idType':'证件类型','f.idNumber':'证件号码','f.idExpiry':'证件有效期至','f.occupation':'职业','f.workplace':'工作单位','f.years':'在韩年数','f.referral':'客户来源','f.carrierType':'通信网','f.planType':'业务类型','f.branchOffice':'接收处管理编码','f.subType':'开通方式','f.address':'地址','f.addressPh':'韩国地址（用于打印申请表）','f.rating':'客户评分','f.notes':'备注','f.notesPh':'职业、客户来源等',
    'opt.prepaid':'先付卡（3个月充值）','opt.postpaid':'后付卡','opt.prepaidShort':'先付卡','opt.postpaidShort':'后付卡','prepaid3m.hint':'先付卡按充值月数计算，选择3个月时会自动套用프리티电信申请表；1/2个月请另外选择对应模板','prepaid3m.editHint':'修改该客户当前套餐的完整信息（不会新增历史记录，仅更正当前记录）','postpaidEdit.hint':'编辑该客户当前后付套餐的完整信息','postpaid.hint':'后付卡为按月合约，保存时会用下方选择的模板生成申请表（请先在「打印模板」页面上传后付卡运营商表格）',
    'plantype.new':'신규가입 新申请','plantype.mnp':'번호이동 携号转网','plantype.transfer':'명의변경 过户/名义变更','plantype.extend':'기간연장 有效期延长','plantype.convert':'선불전환 转为先付',
    'f.customer':'客户','f.serviceInfo':'业务信息','f.serviceType':'业务类型','f.planDuration':'套餐期限（月）','f.contractLength':'合约期限','f.carrier':'通信社 / MVNO','f.plan':'套餐名称','f.number':'电话号码','f.simType':'SIM 类型','f.activationDate':'开通日期','f.durationDays':'合同时长（天）','f.expiryDate':'到期日期','f.status':'办理状态','f.feeInfo':'费用信息','f.monthlyFee':'月租费','f.discount':'折扣','f.firstMonthPayment':'首月费用','f.activationFee':'开通费','f.simFee':'SIM 卡费','f.paymentInfo':'收款与利润','f.sellingPrice':'销售价','f.cost':'成本','f.received':'已收金额','f.paymentMethod':'付款方式','f.commission':'返点 / 提成',
    'f.prepaidPlan':'充值套餐','f.price':'价格','f.discount':'折扣','f.finalPrice':'最终价格','f.usimNumber':'USIM 일련번호',
    'f.company':'가입회사 Company','f.partnerCompany':'파트너사 Partner company','f.svcCarrierType':'통신사 Carrier type','f.usedDays':'已使用天数 Used days','f.contactMethod':'联系方式','f.planOptions':'套餐选项',
    'f.monthlyPayment':'客户每月缴费 Monthly payment','f.monthlyPaymentHint':'客户支付给运营商的金额 · 仅作记录，不计入本店收入','detail.planInfo':'套餐信息','detail.storeIncome':'本店收入','detail.planStarted':'开通日期','detail.planEnds':'到期日期',
    'opt.physical':'实体卡',
    'lang.zh':'中文','lang.en':'英文','lang.ko':'韩文',
    'idtype.ARC':'ARC','idtype.Passport':'护照',
    'type.prepaid':'先付卡','type.postpaid':'后付卡','type.porting':'号码移动','type.transfer':'过户 / 名义变更','type.topup':'充值 / 续费','type.cancel':'解约',
    'status.active':'正常','status.payment_pending':'待付款','status.docs_pending':'待补件','status.expiring_soon':'即将到期','status.expired':'已到期','status.over_contract':'已超合约期','status.cancelled':'已解约','status.completed':'已完成','status.waiting':'等待联系','status.superseded':'已变更（历史）',
    'pay.cash':'现金','pay.transfer':'银行转账','pay.card':'刷卡','pay.kakaopay':'KakaoPay','pay.other':'其他',
    'rem.title':'到期与跟进','rem.desc':'把有效期与合同自动转换为可执行的联系任务','rem.tab.all':'全部','rem.tab.today':'今日到期','rem.tab.week':'7天内','rem.tab.done':'已完成','rem.tab.infochange':'信息变更','rem.tab.expiring':'先付即将到期','rem.expiring.signedUpIn':'签约月份','rem.expiring.duration':'套餐时长','rem.status.all':'全部','rem.status.expired':'已过期','rem.status.expiringSoon':'即将到期','rem.status.active':'未到期','rem.tab.postpaidContract':'后付合约状态','rem.postpaidContract.desc':'合约期已过不代表服务有问题——客户可以选择更换套餐，也可以维持原套餐不变。','rem.status.overContract':'合约期已过','rem.status.contractEndingSoon':'合约即将期满','rem.status.inContract':'合约期内','rem.status.overContractNote':'客户现在可以自由更换套餐，但并非必须——继续使用原套餐也完全没问题。','rem.status.contractEndingSoonNote':'合约期即将结束，届时客户将可以自由选择是否更换套餐。','rem.idChange.pendingTitle':'待处理：信息变更（护照 → 外国人登记证）','rem.idChange.requestedOn':'申请日期','rem.idChange.handledBy':'经办人','rem.idChange.modalTitle':'信息变更（护照 → 外国人登记证）','rem.idChange.modalDesc':'用于记录客户将证件登记从护照改为外国人登记证（ARC），以便使用需要 ARC 的手机应用。','rem.idChange.pickCarrierTitle':'选择信息变更申请表（按通信社）','rem.idChange.pickCarrierDesc':'该客户的通信社有多份或未能自动匹配的信息变更申请表，请选择要打印的版本。','rem.idChange.saveAndPrint':'保存并打印申请表','rem.idChange.completedTitle':'信息变更（护照 → 外国人登记证）','rem.idChange.completedOn':'变更日期','rem.tab.idChange':'信息变更','toast.idChangeSaved':'已记录信息变更','toast.idChangeCompleted':'信息变更已完成，客户证件类型已更新为外国人登记证','toast.freezeSaved':'已保存暂停记录，合约到期日已顺延','toast.unfreezeSaved':'已解除暂停',
    'rem.type.expiry':'有效期到期','rem.type.contract_end':'合同到期','rem.type.payment':'首付款提醒','rem.type.renewal':'折扣到期提醒','rem.type.info_change':'信息变更提醒',
    'rem.dueIn':'天后到期','rem.overdue':'天前已到期','rem.today':'今日到期','rem.auto':'自动生成','rem.empty.title':'暂无提醒','rem.empty.desc':'当有客户即将到期或需要跟进时，会显示在这里',
    'orders.title':'业务订单','orders.desc':'记录先付、后付、号码移动、充值和名义变更','orders.showHistory':'显示已变更的历史记录',
    'rep.byCarrier':'按通信社的营收 / 收入','rep.byType':'按业务类型的营收 / 收入','rep.popularPlans':'热门套餐 Top 5','rep.rates':'续约率 / 回头客率','rep.monthly':'全部月份对账','rep.renewalRate':'续约率','rep.repeatRate':'回头客率','rep.totalOrders':'累计订单数','rep.avgProfit':'平均单笔收入',
    'rep.view.monthly':'📅 月度报表','rep.view.daily':'📆 每日报表','rep.monthlyComparison':'月度对比 — 先付 / 后付收入','rep.prepaidIncome':'先付总收入','rep.postpaidExpected':'后付预期收入','rep.postpaidActual':'后付实际收入','rep.accumulated':'累计总收入',
    'rep.daily.title':'每日报表','rep.daily.desc':'按日期查看先付 / 后付客户数与收入','rep.daily.recent':'近期每日记录','rep.daily.prepaidCustomers':'先付客户数','rep.daily.postpaidCustomers':'后付客户数',
    'col.prepaidCustomers':'先付客户数','col.postpaidCustomers':'后付客户数','col.prepaidIncome':'先付收入','col.postpaidExpected':'后付预期收入','col.postpaidActual':'后付实际收入','col.monthTotal':'合计','col.date':'日期','col.accumulated':'累计总收入',
    'rep.daily.prepaidListTitle':'先付客户明细（本日）','rep.daily.postpaidListTitle':'后付客户明细（本日）','rep.daily.paymentBreakdownTitle':'付款方式汇总（先付，本日）','rep.daily.paymentBreakdownDesc':'按付款方式统计当日先付客户数与收入合计','rep.daily.notSet':'未填写','rep.monthly.paymentBreakdownTitle':'付款方式汇总（先付）','rep.monthly.paymentBreakdownDesc':'按付款方式统计所选月份先付客户数与收入合计',
    'rep.selectMonth':'选择月份','rep.selectMonthDesc':'查看该月份的详细营收报告','rep.allTime':'全部时间','rep.transactions':'本月交易明细','rep.allTransactions':'全部交易明细','rep.profit':'收入','rep.totalExpected':'累计预期收入','rep.transactionCount':'笔交易记录','rep.nowPrepaid':'位客户目前为先付卡','rep.nowPostpaid':'位客户目前为后付卡',
    'stat.weekProfit':'本周收入','stat.monthExpected':'本月预期收入','stat.monthActual':'本月实际收入','stat.notReconciled':'尚未核对','stat.reconciledCount':'笔已核对','stat.pendingReminders':'待处理提醒',
    'io.import.title':'导入 Excel','io.import.desc':'支持导入现有的先付 / 后付客户记录（.xlsx / .csv）','io.import.drop':'拖拽文件到此处，或点击选择文件',
    'io.import.modeTitle':'导入方式','io.import.modeMerge':'与现有客户合并','io.import.modeMergeDesc':'保留现有客户档案，仅新增导入文件中不重复的客户','io.import.modeReplace':'清空现有客户，改用此文件的数据','io.import.modeReplaceDesc':'导入前会先自动导出当前客户数据备份（Excel），再清空并载入新文件','io.import.skipDupes':'自动跳过重复客户（按姓名或电话匹配）',
    'io.import.sheet':'选择表格 Sheet','io.import.sheets':'选择要导入的表格 Sheets to import（可多选，例如同时导入先付卡与后付卡）','io.import.headerRow':'标题行 Header row','io.import.subType':'这批客户属于','io.import.subTypeAuto':'自动判断（根据表格名称）','io.import.subTypePrepaid':'先付卡','io.import.subTypePostpaid':'后付卡',
    'io.export.title':'导出数据','io.export.desc':'导出全部客户与业务数据为一个 Excel 文件（先付/后付各一个分页），结构与「表格视图」完全一致','io.export.all':'📤 导出全部数据',
    'io.yearExport.title':'按类型与年份导出','io.yearExport.desc':'按先付/后付与年份导出，格式为一个年份一个分页，月份之间用一行分隔 — 适合整理归档或未来导入数据库','io.yearExport.typeLabel':'业务类型','io.yearExport.yearLabel':'年份','io.yearExport.btn':'📅 导出该年份数据',
    'io.format.title':'清空数据，重新开始','io.format.desc':'清空全部客户与业务记录，方便导入全新的数据。此操作无法撤销 — 建议先导出备份。','io.format.btn':'🗑 格式化数据 Format Data',
    'sync.title':'服务器同步（多台电脑共享数据）','sync.desc':'连接店内共享服务器后，本电脑与其他电脑可以使用同一份客户数据。未连接前，数据仅保存在本电脑。','sync.urlLabel':'服务器地址','sync.keyLabel':'密钥 API Key（在服务器 .env 文件中设置）','sync.test':'测试连接','sync.pushNow':'立即推送本机数据到服务器','sync.pullNow':'从服务器拉取最新数据','sync.enable':'启用自动同步（保存时自动推送，打开页面时自动拉取）',
    'lock.title':'365Himobile 客户管理系统','lock.desc':'请输入服务器地址与密钥以载入客户数据','lock.passwordLabel':'密钥 / 密码','lock.unlock':'解锁并载入数据','lock.skip':'跳过 — 仅在本机使用（空白，不含任何客户数据）','lock.logout':'🔒 退出登录 Log out',
    'io.issues.title':'数据完整性检查','io.issues.desc':'缺失联系方式、有效期、证件信息或付款信息的客户','io.issues.none':'没有发现数据问题，档案很完整 👍','io.bulkClearPayment.title':'批量清空付款方式','io.bulkClearPayment.desc':'用于一次性清空某个月份所有客户的付款方式，方便之后逐一核实填写','io.bulkClearPayment.btn':'清空该月份付款方式','io.bulkClearPayment.byActivation':'按开通日期匹配','io.bulkClearPayment.byAdded':'按添加日期匹配',
    'issue.noContact':'缺少联系电话','issue.noIdExpiry':'缺少证件有效期','issue.noIdNumber':'缺少证件号码','issue.noActiveService':'没有任何业务记录','issue.unpaid':'存在未结清欠款',
    'toast.customerSaved':'客户已保存','toast.orderSaved':'业务已保存','toast.reminderDone':'已标记完成','toast.reminderFollowup':'已设为再次跟进','toast.imported':'导入完成','toast.exported':'已导出','toast.deleted':'已删除','toast.langChanged':'语言已切换为中文','toast.cancellationUndone':'客户已恢复为活跃状态',
    'age.years':'岁','years.suffix':'年',
    'detail.contract':'合同 / 有效期','detail.remaining':'剩余','detail.days':'天','detail.usedOf':'已使用 / 总时长','detail.noServices':'该客户暂无业务记录','detail.services':'业务与号码记录','detail.profile':'客户资料',
    'detail.activeSubscription':'当前订阅','detail.noActiveSubscription':'暂无有效订阅','detail.planHistory':'套餐历史记录','detail.noHistory':'暂无历史记录','detail.otherRecords':'其他业务记录（携号转网 / 过户 / 充值等）','detail.currentPlan':'当前套餐',
    'f.cancelReason':'取消原因',
    'reason.new':'新开通','reason.upgraded_to_postpaid':'升级为后付卡','reason.plan_change':'变更套餐','reason.cancelled':'客户不再续约','reason.switched_carrier':'转换其他通信社','reason.expired_natural':'自然到期','reason.other':'其他','reason.merged':'重复客户已合并','reason.recharge':'充值续约','reason.downgraded_to_prepaid':'转为先付卡',
    'ai.elig.noDob':'缺少出生日期，无法判断资格','ai.elig.ageOk':'已年满 {age} 岁，符合后付卡开通资格','ai.elig.turningAge':'{days} 天后年满19岁，即将符合资格','ai.elig.tooYoung':'目前 {age} 岁，未满19岁','ai.elig.alreadyPostpaid':'目前已是后付卡客户',
    'ai.elig.contractCompleted':'合约已到期 {days} 天，尚未处理','ai.elig.contractApproaching':'合约将在 {days} 天后到期','ai.elig.contractMid':'合约进行中，{days} 天后到期',
    'ai.elig.needsArc':'需持外国人登录证（ARC）才符合资格','ai.elig.missingIdNumber':'缺少证件号码，需核实','ai.elig.missingIdExpiry':'缺少证件有效期，需核实','ai.elig.idExpired':'证件已过期，需更新','ai.elig.idComplete':'证件信息完整有效',
    'ai.churn.noActive':'已 {days} 天没有有效订阅','ai.churn.expired':'订阅已到期尚未续约','ai.churn.overContract':'已超过合约期，尚未续约或更换套餐','ai.churn.expiringSoon':'订阅即将到期','ai.churn.outstanding':'账单有未收余额','ai.churn.stable':'订阅状态稳定',
    'ai.reason.postpaidReady':'先付卡客户，已符合转后付卡资格','ai.reason.noAction':'暂无需要处理的事项',
    'ai.action.postpaidConversion':'联系客户，推荐转为后付卡','ai.action.waitEligibility':'暂缓联系，待资格达成后再跟进','ai.action.planReview':'合约已到期，建议协助办理续约或更换套餐','ai.action.renewalFollowup':'合约即将到期，提前联系提醒续约','ai.action.idVerification':'联系客户补充或更新证件信息','ai.action.winback':'客户已流失，建议主动联系挽回','ai.action.none':'暂无建议操作',
    'ai.disclaimer':'💡 优先级评分与商机建议由规则引擎与透明的加权评分计算得出，并非黑箱机器学习模型 — 每一项数字均可追溯到真实客户数据。',
    'ai.topActions.title':'🔥 今日建议优先处理','ai.topActions.desc':'点击每一类查看对应客户名单','ai.topActions.emptyTitle':'目前没有需要优先处理的事项 👍','ai.topActions.emptyDesc':'所有客户目前都没有紧急商机或风险',
    'ai.stay.title':'按预计在韩时长的商机','ai.stay.desc':'点击每一类查看对应客户名单','ai.stay.category':'类别','ai.stay.count':'客户数','ai.stay.action':'建议操作','ai.stay.pageDesc':'找出适合转后付、需要续费、或适合升级合约的客户 — 点击任意卡片查看名单与明细',
    'ai.stay.readyForPostpaid':'可转后付','ai.stay.readyForPostpaidAction':'联系转后付事宜','ai.stay.readyForPostpaidDesc':'先付卡客户——已满19岁、持护照或外国人登记证（ARC）、预计在韩停留8个月以上的视为符合资格，即使目前套餐尚未用完也会列出（并显示当前套餐剩余天数）；未满19岁的也会列出，并显示距离19岁生日还有多少天','ai.stay.underage':'未满19岁','ai.stay.missing.summary':'位客户因资料不全，未能纳入上方统计','ai.stay.missing.both':'缺少证件类型与在韩年数','ai.stay.missing.idType':'证件类型非护照/ARC或未填写','ai.stay.missing.years':'缺少在韩年数','ai.stay.missing.dob':'缺少出生日期，无法判断年龄','btn.hide':'收起','btn.show':'展开',
    'ai.stay.prepaidRecharge':'先付续费','ai.stay.prepaidRechargeAction':'联系续费事宜','ai.stay.prepaidRechargeDesc':'1/2/3个月套餐即将到期，且仍有剩余在韩时间的先付客户',
    'ai.stay.postpaidUpgrade':'后付续约','ai.stay.postpaidUpgradeAction':'提供新合约','ai.stay.postpaidUpgradeDesc':'合约已到期，且预计还将在韩停留8个月以上的后付客户',
    'ai.stay.finishedNeedsRecharge':'仅可续费','ai.stay.finishedNeedsRechargeAction':'发送续费提醒短信','ai.stay.finishedNeedsRechargeDesc':'先付套餐已到期，但因未满19岁或在韩停留不足8个月而无法转后付的客户——建议发送短信提醒其续费','btn.openSms':'发送短信','btn.copySms':'复制短信文字','toast.smsCopied':'短信文字已复制',
    'ai.stay.noYearsNote':'（结果基于客户档案中的「在韩年数」字段，代表预计剩余停留时长；未填写该字段的客户不会出现在此处）',
    'ai.ask.title':'💬 向 AI 商业分析师提问','ai.ask.desc':'用真实客户数据回答，并展示计算依据（点击下方问题试试看）','ai.ask.placeholder':'例如：本月有多少客户可以升级？','ai.ask.btn':'提问',
    'ai.opps.title':'客户商机列表','ai.opps.desc':'按优先级排序，点击客户可查看详细的 AI 洞察',
    'ai.filter.allPriority':'全部优先级','ai.filter.allTypes':'全部商机类型',
    'ai.priority.high':'高优先级','ai.priority.medium':'中优先级','ai.priority.low':'低优先级','ai.priority.none':'无需处理',
    'ai.opp.postpaid_conversion':'先付转后付','ai.opp.postpaid_conversion_soon':'即将符合资格','ai.opp.plan_review':'合约已到期','ai.opp.renewal_followup':'即将到期','ai.opp.id_verification':'证件待核实','ai.opp.winback':'流失待挽回',
    'ai.col.priority':'优先级','ai.col.score':'评分','ai.col.opportunity':'商机类型','ai.col.action':'建议操作','ai.col.currentRev':'目前营收','ai.col.uplift':'潜在增量',
    'ai.stat.currentRevenue':'目前每月营收','ai.stat.currentRevenueSub':'所有有效订阅','ai.stat.potentialRevenue':'潜在增量营收','ai.stat.potentialRevenueSub':'来自识别出的商机（估算值）','ai.stat.highPriority':'高优先级商机','ai.stat.highPrioritySub':'建议优先联系的客户数','ai.stat.atRiskRevenue':'风险营收','ai.stat.atRiskRevenueSub':'可能流失客户的月营收',
    'ai.topAction.postpaidNow':'位先付卡客户已符合转后付卡资格','ai.topAction.contractDone':'位后付卡客户合约已到期尚未处理','ai.topAction.renewalSoon':'位后付卡客户合约即将到期','ai.topAction.approachingAge':'位客户即将符合后付卡资格','ai.topAction.atRisk':'位客户存在流失风险','ai.topAction.idVerify':'位客户证件信息需要核实',
    'ai.q.potentialRevenue':'我们现有客户还有多少潜在营收？','ai.q.howManyUpgrade':'本月有多少客户可以升级？','ai.q.prepaidToPostpaid':'有多少先付卡客户可以转后付卡？','ai.q.contactToday':'今天应该联系哪些客户？','ai.q.bestPlan':'哪个套餐营收最高？','ai.q.atRisk':'有多少客户存在流失风险？','ai.q.forecast20pct':'如果20%符合资格客户升级，能增加多少营收？',
    'ai.insight.title':'AI 客户洞察',
    'toast.subscriptionCancelled':'订阅已取消',
    'confirm.delete':'确定要删除吗？此操作无法撤销。',
    'io.rows':'行','io.detected':'检测到',
    'tpl.title':'运营商纸质表格模板','tpl.desc':'上传通信社的申请表底图，标记字段位置，即可用新客户信息自动打印','tpl.upload':'上传新模板','tpl.editor.new':'新建模板','tpl.editor.edit':'编辑模板','tpl.name':'模板名称','tpl.carrier':'通信社','tpl.purpose':'用途','tpl.purpose.general':'一般（运营商申请表）','tpl.purpose.idChange':'信息变更申请表（第1页 + 第2页）','tpl.page2Label':'第2页图片','tpl.uploadHint':'点击或拖拽上传运营商表格图片（JPG / PNG，建议 A4 比例扫描件）','tpl.canvasHint':'点击图片任意位置添加字段，拖动字段调整位置','tpl.changeImage':'更换图片','tpl.fieldsList':'已添加字段','tpl.noFields':'点击左侧图片添加第一个字段',
    'tpl.section.general':'一般运营商申请表','tpl.section.generalDesc':'用于新客户开通、续约与变更套餐 — 会出现在「新建客户」等模板选择列表中','tpl.section.idChange':'信息变更申请表（护照 → 外国人登记证）','tpl.section.idChangeDesc':'每个通信社一个模板，第1页与第2页图片一起上传 — 仅用于「信息变更」打印，不会出现在新客户或一般打印的模板列表中',
    'print.preview':'打印预览','print.template':'选择模板','print.includeBg':'预览显示底图（打印在空白纸上勾选此项）','print.bgHint':'如果打印出来没有底图，请在浏览器打印对话框中开启「背景图形 / Background graphics」选项后再打印，否则底图不会被打印出来。',
    'prepaid3m.toggle':'同时开通「3个月先付卡」并打印申请表',
  },
  en: {
    'sidebar.sub':'Customer Management · CRM','sidebar.store':'Korea SIM Store','sidebar.staffSub':'Click to switch staff',
    'nav.dashboard':'Dashboard','nav.customers':'Customers','nav.sheet':'Sheet View','nav.ai':'AI Insights','nav.reminders':'Reminders','nav.orders':'Orders','nav.reports':'Reports','nav.templates':'Print Templates','nav.io':'Import / Export',
    'sub.sheet':'Edit customer & plan info directly, like a spreadsheet',
    'sheet.hint':'💡 Click a colored tag to pick a new value; click text/numbers/dates to edit directly — press Enter or click away to save',
    'sub.dashboard':'Store operations overview','sub.customers':'Customer profiles & plan management','sub.ai':'Find who\'s ready for postpaid, due for a recharge, or worth a contract upgrade','sub.reminders':'Expiry, contract & info-change reminders','sub.orders':'Prepaid, postpaid, porting and other service records','sub.reports':'Revenue, profit and customer breakdowns','sub.templates':'Auto-fill and print carrier application forms','sub.io':'Excel import and data backup',
    'btn.newCustomer':'New customer','btn.exportExcel':'Export Excel','btn.exportMonthExcel':'Export this month (Excel)','btn.addFollowup':'＋ Add reminder','btn.newOrder':'＋ New order','btn.cancel':'Cancel','btn.saveCustomer':'Save customer','btn.saveOrder':'Save order','btn.edit':'Edit profile','btn.addService':'＋ Add service','btn.confirmImport':'Confirm import','btn.view':'View','btn.complete':'Complete','btn.followUpAgain':'Follow up again','btn.delete':'Delete','btn.deleteCustomer':'Delete customer','btn.saveTemplate':'Save template','btn.print':'Print','btn.savePrint':'Save & print application form','btn.merge':'Merge','btn.copyName':'Copy name','btn.save':'Save','btn.requestIdChange':'Information change','btn.markComplete':'Mark complete','btn.freezeSim':'Freeze SIM','btn.unfreezeSim':'Unfreeze SIM',
    'freeze.modalTitle':'Freeze SIM','freeze.modalDesc':'Frozen time doesn\'t count toward the contract — the end date pushes back by however many days are frozen. Postpaid only.','freeze.byDays':'By days','freeze.byRange':'By date range','freeze.startDate':'Start date','freeze.endDate':'End date','freeze.days':'Days to freeze','freeze.frozen':'Frozen','freeze.colHeader':'Freeze status','freeze.clickToUnfreeze':'Click to unfreeze',
    'btn.changeToPostpaid':'Change to Postpaid','btn.changePlan':'Change Plan','btn.cancelSubscription':'Cancel Subscription','btn.startNewSubscription':'＋ Start New Subscription','btn.confirmChange':'Confirm Change','btn.confirmCancel':'Confirm Cancellation','btn.back':'Back','btn.undoCancel':'Reactivate',
    'btn.recharge':'Recharge','btn.changeToPrepaid':'Change to Prepaid','btn.confirmRecharge':'Confirm Recharge',
    'dash.greeting':'Good morning, Manager','dash.followup.title':"Today's follow-ups",'dash.followup.desc':'Reach out to customers expiring soon','dash.viewall':'View all →','dash.overview.title':'Service overview','dash.overview.desc':'Activations this month','dash.recent.title':'Recently added customers','dash.recent.desc':'Confirm newly activated numbers and plans','dash.customerlist':'Customer list →','dash.nationality.title':'Customers by nationality','dash.referral.title':'Customers by referral source','dash.paymentToday.title':"Today's payment method breakdown (prepaid)",'dash.paymentToday.desc':'Customer count and income total per payment method today',
    'dash.quickSearch':'🔍 Quick search by name, phone, or ID...','dash.noMatches':'No matching customers found','dash.dupeBanner':'Found {groups} duplicate groups ({n} customers total) — worth reviewing and merging','dash.dupeBannerBtn':'Review now','dash.renewals.title':'Contracts ending soon (30 days)','dash.renewals.desc':'Postpaid contracts nearing renewal — reach out ahead of time','dash.renewals.emptyTitle':'No contracts ending soon 👍','dash.renewals.emptyDesc':'No postpaid contracts due for renewal in the next 30 days','dash.winback.title':'Cancelled / win-back opportunities','dash.winback.desc':'Customers who cancelled and haven\'t restarted','dash.winback.emptyTitle':'No lapsed customers','dash.winback.emptyDesc':'Everyone who ever subscribed currently has an active plan','dash.revenueTrend.title':'Revenue trend (last 6 months)','dash.cancelReasons.title':'Cancellation reasons','dash.noCancellations':'No cancellations in the last 6 months 👍',
    'stat.totalCustomers':'Total customers','stat.newThisMonth':'New this month','stat.followup7':'Due within 7 days','stat.revenueMonth':'Revenue this month','stat.fromRecords':'From existing prepaid / postpaid records','stat.vsLastMonth':'vs last month','stat.includesExpiry':'Includes expiries & first-month payments','stat.expiringSoon':'Expiring soon','stat.infoChangeNeeded':'Need info change',
    'stat.activePrepaid':'Active prepaid','stat.activePostpaid':'Active postpaid','stat.activeBook':'Currently active','stat.outstanding':'Outstanding total','stat.outstandingSub':'Across active & recent orders','stat.renewalsSoon':'Contracts renewing soon','stat.renewalsSub':'Postpaid, due within 30 days','stat.newActivity':'New vs last month',
    'col.customer':'Customer','col.number':'Number','col.service':'Service','col.carrier':'Carrier','col.activated':'Activated','col.status':'Status','col.contact':'Contact','col.phoneNumber':'Phone number','col.nationality':'Nationality','col.id':'ID','col.subType':'Subscription','col.currentNumber':'Current number','col.recentActivity':'Recent activity','col.rating':'Rating','col.serviceType':'Service type','col.plan':'Plan','col.amount':'Amount','col.outstanding':'Outstanding','col.month':'Month','col.orders':'Orders','col.revenue':'Revenue','col.cost':'Cost','col.profit':'Profit','col.outstandingTotal':'Total outstanding','col.dupeReason':'Match reason','col.contractStatus':'Contract status',
    'dupe.reasonName':'Same name','dupe.reasonPhone':'Same phone',
    'col.expectedProfit':'Expected profit','col.actualProfit':'Actual profit (reconciled)','col.variance':'Variance','col.discountGiven':'Discount given','col.netExpected':'Net expected profit',
    'custtab.all':'All customers','custtab.prepaid':'Prepaid customers','custtab.postpaid':'Postpaid customers','custtab.inactive':'Inactive customers','custtab.dupes':'Duplicate customers',
    'ph.search':'Search name, number, nationality or ID',
    'filter.allNationalities':'All nationalities','filter.allRatings':'All ratings','filter.allTypes':'All service types','filter.allStatus':'All statuses',
    'filter.allDurations':'Active for: any length','filter.duration6':'Active 6+ months','filter.duration8':'Active 8+ months','filter.duration12':'Active 1+ year','col.activeFor':'Active for',
    'filter.allTime':'Added: any time','filter.today':'Added today','filter.last7':'Last 7 days','filter.thisMonth':'This month','filter.last30':'Last 30 days','col.dateAdded':'Date added','filter.activationDateRange':'Activation date range','filter.clearDates':'Clear dates','filter.activationDateFrom':'Activation date from','filter.activationDateTo':'Activation date to',
    'sort.newest':'Sort: Newest first','sort.oldest':'Sort: Oldest first','sort.nameAsc':'Name A → Z','sort.nameDesc':'Name Z → A','sort.ratingHigh':'Rating: High to low','sort.ratingLow':'Rating: Low to high',
    'modal.newCustomer':'New customer','modal.editCustomer':'Edit customer','modal.customerProfile':'Customer profile','modal.newOrder':'New order','modal.editOrder':'Edit order','modal.importPreview':'Import preview','modal.changeToPostpaid':'Change to Postpaid','modal.changePlan':'Change Plan','modal.cancelSubscription':'Cancel Subscription',
    'cs.autofillHint':'Name / phone / nationality / occupation / ID number are auto-filled from the existing customer record — edit directly if needed','cs.idNumberArc':'ID number (ARC)',
    'modal.chooseType':'New customer','modal.chooseTypeDesc':'Choose the customer type first — the two forms have different fields','modal.prepaidDesc':'Fixed 3-month recharge plan','modal.postpaidDesc':'Monthly contract, pick carrier & plan','modal.newPostpaidCustomer':'New postpaid customer',
    'f.contactHandle':'Contact account / ID','f.workType':'Work type','f.handlerName':'Handled by','f.referralFriend':'Referred by (friend\'s name)','f.date':'Date',
    'f.profitSection':'Company price & discount','f.expectedProfit':'Company price','f.actualProfit':'Real company price','f.usimFee':'USIM fee','f.discountPerMonth':'Discount / month','f.discountMonths':'Discount months','f.netExpectedProfit':'Expected income','f.expectedIncome':'Expected income','f.actualIncome':'Actual income','f.discountTotal':'Total discount','f.actualProfitHint':'💡 "Real company price" gets filled in later once the carrier settles at month-end, used to calculate actual income and compare it against your estimate — you can fill it in anytime from Sheet View after saving.',
    'f.name':'Customer name','f.phone':'Phone number','f.nationality':'Nationality / Country','f.nationalityPh':'e.g. CHINA / VIETNAM','f.dob':'Date of birth','f.kakao':'KakaoTalk ID','f.wechat':'WeChat ID','f.idType':'ID type','f.idNumber':'ID number (ARC/Passport)','f.idExpiry':'ID expiry date','f.occupation':'Occupation','f.workplace':'Workplace','f.years':'Years in Korea','f.referral':'Referral source','f.carrierType':'Carrier network','f.planType':'Plan type','f.branchOffice':'Branch office code','f.subType':'Subscription type','f.address':'Address','f.addressPh':'Korean address (used for printing application forms)','f.rating':'Customer rating','f.notes':'Notes','f.notesPh':'Occupation, referral source, etc.',
    'opt.prepaid':'Prepaid (3-month recharge, fixed)','opt.postpaid':'Postpaid','opt.prepaidShort':'Prepaid','opt.postpaidShort':'Postpaid','prepaid3m.hint':'Prepaid is billed by recharge months — choosing 3 months auto-applies the Preeti Telecom form; 1/2-month plans use whichever other template you select','prepaid3m.editHint':'Editing this customer\'s current plan in full (this corrects the existing record — it does not add a new history entry)','postpaidEdit.hint':'Editing this customer\'s current postpaid plan in full','postpaid.hint':'Postpaid is a monthly contract — saving will generate the application form using the template selected below (upload your postpaid carrier form in Print Templates first)',
    'plantype.new':'신규가입 New sign-up','plantype.mnp':'번호이동 Number port (MNP)','plantype.transfer':'명의변경 Ownership/name change','plantype.extend':'기간연장 Period extension','plantype.convert':'선불전환 Convert to prepaid',
    'f.customer':'Customer','f.serviceInfo':'Service details','f.serviceType':'Service type','f.planDuration':'Plan duration (months)','f.contractLength':'Contract length','f.carrier':'Carrier / MVNO','f.plan':'Plan name','f.number':'Phone number','f.simType':'SIM type','f.activationDate':'Activation date','f.durationDays':'Contract length (days)','f.expiryDate':'Expiry date','f.status':'Status','f.feeInfo':'Fee details','f.monthlyFee':'Monthly fee','f.discount':'Discount','f.firstMonthPayment':'First month payment','f.activationFee':'Activation fee','f.simFee':'SIM card fee','f.paymentInfo':'Payment & profit','f.sellingPrice':'Selling price','f.cost':'Cost','f.received':'Amount received','f.paymentMethod':'Payment method','f.commission':'Commission / rebate',
    'f.prepaidPlan':'Plan','f.price':'Price','f.discount':'Discount','f.finalPrice':'Final price','f.usimNumber':'USIM serial number',
    'f.company':'Company','f.partnerCompany':'Partner company','f.svcCarrierType':'Carrier type','f.usedDays':'Used days','f.contactMethod':'Contact method','f.planOptions':'Plan options',
    'f.monthlyPayment':'Monthly payment','f.monthlyPaymentHint':'What the customer pays the carrier · display only, not counted as store income','detail.planInfo':'Plan info','detail.storeIncome':'Store income','detail.planStarted':'Started','detail.planEnds':'Ends',
    'opt.physical':'Physical SIM',
    'lang.zh':'Chinese','lang.en':'English','lang.ko':'Korean',
    'idtype.ARC':'ARC','idtype.Passport':'Passport',
    'type.prepaid':'Prepaid SIM','type.postpaid':'Postpaid SIM','type.porting':'Number porting','type.transfer':'Ownership transfer','type.topup':'Top-up / renewal','type.cancel':'Cancellation',
    'status.active':'Active','status.payment_pending':'Payment pending','status.docs_pending':'Documents pending','status.expiring_soon':'Expiring soon','status.expired':'Expired','status.over_contract':'Over contract','status.cancelled':'Cancelled','status.completed':'Completed','status.waiting':'Awaiting contact','status.superseded':'Replaced (history)',
    'pay.cash':'Cash','pay.transfer':'Bank transfer','pay.card':'Card','pay.kakaopay':'KakaoPay','pay.other':'Other',
    'rem.title':'Reminder centre','rem.desc':'Turns expiry dates and contracts into actionable follow-up tasks','rem.tab.all':'All','rem.tab.today':'Due today','rem.tab.week':'Within 7 days','rem.tab.done':'Completed','rem.tab.infochange':'Info change','rem.tab.expiring':'Prepaid expiring','rem.expiring.signedUpIn':'Signed up in','rem.expiring.duration':'Plan duration','rem.status.all':'All','rem.status.expired':'Expired','rem.status.expiringSoon':'Expiring soon','rem.status.active':'Not expired','rem.tab.postpaidContract':'Postpaid contract status','rem.postpaidContract.desc':'Being over contract doesn\'t mean anything\'s wrong with the service — the customer is free to change plans if they want, but can just as easily keep the one they\'re on.','rem.status.overContract':'Over contract','rem.status.contractEndingSoon':'Contract ending soon','rem.status.inContract':'In contract','rem.status.overContractNote':'Free to change plans now, but doesn\'t have to — keeping the current plan is completely fine.','rem.status.contractEndingSoonNote':'Contract period ending soon — the customer will be free to change plans once it does.','rem.idChange.pendingTitle':'Pending: Information change (Passport → Resident Card)','rem.idChange.requestedOn':'Requested on','rem.idChange.handledBy':'Handled by','rem.idChange.modalTitle':'Information change (Passport → Resident Card)','rem.idChange.modalDesc':'Records that this customer\'s registered ID was switched from Passport to a Resident Card (ARC), so they can use apps that require one.','rem.idChange.pickCarrierTitle':'Pick the information change form (by carrier)','rem.idChange.pickCarrierDesc':'This customer\'s carrier has multiple forms on file, or couldn\'t be auto-matched — pick which version to print.','rem.idChange.saveAndPrint':'Save & print application form','rem.idChange.completedTitle':'Information change (Passport → Resident Card)','rem.idChange.completedOn':'Changed on','rem.tab.idChange':'Information changes','toast.idChangeSaved':'Information change saved','toast.idChangeCompleted':'Information change saved — customer\'s ID type updated to Resident Card','toast.freezeSaved':'Freeze saved — contract end date has been pushed back','toast.unfreezeSaved':'SIM unfrozen',
    'rem.type.expiry':'Expiry','rem.type.contract_end':'Contract end','rem.type.payment':'First payment','rem.type.renewal':'Discount ending','rem.type.info_change':'Information change',
    'rem.dueIn':'days left','rem.overdue':'days overdue','rem.today':'due today','rem.auto':'auto-generated','rem.empty.title':'No reminders','rem.empty.desc':'Reminders will appear here once customers are expiring or need follow-up',
    'orders.title':'Service orders','orders.desc':'Prepaid, postpaid, porting, top-up and ownership-transfer records','orders.showHistory':'Show replaced/history records',
    'rep.byCarrier':'Revenue / income by carrier','rep.byType':'Revenue / income by service type','rep.popularPlans':'Top 5 popular plans','rep.rates':'Renewal rate / repeat-customer rate','rep.monthly':'All months reconciliation','rep.renewalRate':'Renewal rate','rep.repeatRate':'Repeat-customer rate','rep.totalOrders':'Total orders','rep.avgProfit':'Avg. income / order',
    'rep.view.monthly':'📅 Monthly Report','rep.view.daily':'📆 Daily Report','rep.monthlyComparison':'Month-to-month comparison — Prepaid / Postpaid income','rep.prepaidIncome':'Prepaid total income','rep.postpaidExpected':'Postpaid expected income','rep.postpaidActual':'Postpaid actual income','rep.accumulated':'Accumulated income',
    'rep.daily.title':'Daily Report','rep.daily.desc':'View prepaid / postpaid customer counts and income by date','rep.daily.recent':'Recent daily records','rep.daily.prepaidCustomers':'Prepaid customers','rep.daily.postpaidCustomers':'Postpaid customers',
    'col.prepaidCustomers':'Prepaid customers','col.postpaidCustomers':'Postpaid customers','col.prepaidIncome':'Prepaid income','col.postpaidExpected':'Postpaid expected','col.postpaidActual':'Postpaid actual','col.monthTotal':'Total','col.date':'Date','col.accumulated':'Accumulated total',
    'rep.daily.prepaidListTitle':'Prepaid customers (today)','rep.daily.postpaidListTitle':'Postpaid customers (today)','rep.daily.paymentBreakdownTitle':'Payment method breakdown (prepaid, today)','rep.daily.paymentBreakdownDesc':'Customer count and income total for each payment method used today','rep.daily.notSet':'Not set','rep.monthly.paymentBreakdownTitle':'Payment method breakdown (prepaid)','rep.monthly.paymentBreakdownDesc':'Customer count and income total for each payment method used in the selected month',
    'rep.selectMonth':'Select month','rep.selectMonthDesc':'View a detailed revenue report for that month','rep.allTime':'All time','rep.transactions':'Transactions this month','rep.allTransactions':'All transactions','rep.profit':'Income','rep.totalExpected':'Total expected income','rep.transactionCount':'transactions','rep.nowPrepaid':'now prepaid','rep.nowPostpaid':'now postpaid',
    'stat.weekProfit':'Income this week','stat.monthExpected':'Expected income this month','stat.monthActual':'Actual income this month','stat.notReconciled':'Not reconciled yet','stat.reconciledCount':'reconciled','stat.pendingReminders':'Pending reminders',
    'io.import.title':'Import Excel','io.import.desc':'Import existing prepaid / postpaid customer records (.xlsx / .csv)','io.import.drop':'Drag a file here, or click to choose',
    'io.import.modeTitle':'Import mode','io.import.modeMerge':'Merge with existing customers','io.import.modeMergeDesc':'Keeps existing customer records; only adds new customers that aren\'t already in the list','io.import.modeReplace':'Clear existing customers and use this file instead','io.import.modeReplaceDesc':'Automatically exports a backup of current customer data (Excel) first, then clears and loads the new file','io.import.skipDupes':'Automatically skip duplicate customers (matched by name or phone)',
    'io.import.sheet':'Sheet','io.import.sheets':'Sheets to import (select multiple — e.g. prepaid and postpaid together)','io.import.headerRow':'Header row','io.import.subType':'Customer type for this sheet','io.import.subTypeAuto':'Auto-detect from sheet name','io.import.subTypePrepaid':'Prepaid','io.import.subTypePostpaid':'Postpaid',
    'io.export.title':'Export data','io.export.desc':'Export all customer and business data as one Excel file (Prepaid and Postpaid on separate sheets) — matches Sheet View exactly','io.export.all':'📤 Export all data',
    'io.yearExport.title':'Export by type & year','io.yearExport.desc':'Export by prepaid/postpaid and year, formatted as one sheet per year with months separated by a divider row — good for archiving or a future database import','io.yearExport.typeLabel':'Subscription type','io.yearExport.yearLabel':'Year','io.yearExport.btn':'📅 Export this year',
    'io.format.title':'Clear data and start fresh','io.format.desc':'Clears all customers and service records so you can import a brand new file. This cannot be undone — exporting a backup first is recommended.','io.format.btn':'🗑 Format Data',
    'sync.title':'Server sync (share data across computers)','sync.desc':'Once connected to your store\'s shared server, this computer and others can use the same customer data. Until connected, data stays on this computer only.','sync.urlLabel':'Server address','sync.keyLabel':'API Key (set in the server\'s .env file)','sync.test':'Test connection','sync.pushNow':'Push this computer\'s data to the server now','sync.pullNow':'Pull latest data from the server','sync.enable':'Enable automatic sync (push on save, pull on page load)',
    'lock.title':'365Himobile Customer Management','lock.desc':'Enter the server address and password to load customer data','lock.passwordLabel':'Password / Key','lock.unlock':'Unlock & Load Data','lock.skip':'Skip — use this computer only (blank, no customer data)','lock.logout':'🔒 Log out',
    'io.issues.title':'Data health check','io.issues.desc':'Customers missing contact info, expiry dates, ID details or payment info','io.issues.none':'No data issues found — records look complete 👍','io.bulkClearPayment.title':'Bulk clear payment method','io.bulkClearPayment.desc':'Clears the payment method for every customer in a given month at once, so you can go back and fill each one in accurately','io.bulkClearPayment.btn':'Clear payment method for this month','io.bulkClearPayment.byActivation':'Match by activation date','io.bulkClearPayment.byAdded':'Match by date added',
    'issue.noContact':'Missing phone number','issue.noIdExpiry':'Missing ID expiry date','issue.noIdNumber':'Missing ID number','issue.noActiveService':'No service records','issue.unpaid':'Has outstanding balance',
    'toast.customerSaved':'Customer saved','toast.orderSaved':'Order saved','toast.reminderDone':'Marked as completed','toast.reminderFollowup':'Set to follow up again','toast.imported':'Import complete','toast.exported':'Exported','toast.deleted':'Deleted','toast.langChanged':'Language switched to English','toast.cancellationUndone':'Customer reactivated',
    'age.years':'yrs','years.suffix':'yrs',
    'detail.contract':'Contract / validity','detail.remaining':'Remaining','detail.days':'days','detail.usedOf':'Used / total length','detail.noServices':'No service records yet','detail.services':'Services & numbers','detail.profile':'Profile',
    'detail.activeSubscription':'Active Subscription','detail.noActiveSubscription':'No active subscription','detail.planHistory':'Plan History','detail.noHistory':'No history yet','detail.otherRecords':'Other records (porting / ownership transfer / top-ups etc.)','detail.currentPlan':'Current plan',
    'f.cancelReason':'Cancellation reason',
    'reason.new':'New subscription','reason.upgraded_to_postpaid':'Upgraded to postpaid','reason.plan_change':'Plan change','reason.cancelled':'Customer discontinued (not renewing)','reason.switched_carrier':'Switched carrier','reason.expired_natural':'Expired naturally','reason.other':'Other','reason.merged':'Merged duplicate record','reason.recharge':'Recharged','reason.downgraded_to_prepaid':'Changed to prepaid',
    'ai.elig.noDob':'Missing date of birth — can\'t determine eligibility','ai.elig.ageOk':'Already {age} years old — meets postpaid eligibility','ai.elig.turningAge':'Turns 19 in {days} days — approaching eligibility','ai.elig.tooYoung':'Currently {age} years old — under 19','ai.elig.alreadyPostpaid':'Already a postpaid customer',
    'ai.elig.contractCompleted':'Contract ended {days} days ago, not yet actioned','ai.elig.contractApproaching':'Contract ends in {days} days','ai.elig.contractMid':'Contract active, {days} days remaining',
    'ai.elig.needsArc':'Requires an Alien Registration Card (ARC) to be eligible','ai.elig.missingIdNumber':'Missing ID number — needs verification','ai.elig.missingIdExpiry':'Missing ID expiry date — needs verification','ai.elig.idExpired':'ID has expired — needs updating','ai.elig.idComplete':'ID information complete and valid',
    'ai.churn.noActive':'No active subscription for {days} days','ai.churn.expired':'Subscription expired and not renewed','ai.churn.overContract':'Past the contract term — hasn\'t renewed or changed plans yet','ai.churn.expiringSoon':'Subscription expiring soon','ai.churn.outstanding':'Unpaid balance on this account','ai.churn.stable':'Subscription is stable',
    'ai.reason.postpaidReady':'Prepaid customer who now meets postpaid eligibility','ai.reason.noAction':'No action needed right now',
    'ai.action.postpaidConversion':'Contact customer about postpaid conversion','ai.action.waitEligibility':'Hold off — follow up once eligible','ai.action.planReview':'Contract completed — help arrange renewal or plan change','ai.action.renewalFollowup':'Contract ending soon — send a renewal reminder','ai.action.idVerification':'Contact customer to update or complete ID info','ai.action.winback':'Customer has lapsed — worth a win-back outreach','ai.action.none':'No recommended action',
    'ai.disclaimer':'💡 Priority scores and opportunities come from a rule engine and a transparent weighted formula — not a black-box ML model. Every number traces back to real customer data.',
    'ai.topActions.title':'🔥 Top actions today','ai.topActions.desc':'Click a category to see the matching customers','ai.topActions.emptyTitle':'Nothing urgent right now 👍','ai.topActions.emptyDesc':'No customers currently have pressing opportunities or risks',
    'ai.stay.title':'Opportunities by expected time remaining in Korea','ai.stay.desc':'Click a category to see the matching customers','ai.stay.category':'Category','ai.stay.count':'Customers','ai.stay.action':'Suggested action','ai.stay.pageDesc':'Find customers ready to move to postpaid, due for a recharge, or worth offering a longer contract — click any card to see the list and details',
    'ai.stay.readyForPostpaid':'Ready for postpaid','ai.stay.readyForPostpaidAction':'Contact about postpaid','ai.stay.readyForPostpaidDesc':'Prepaid customers who are 19+, hold a Passport or Resident Card (ARC), and are staying 8+ more months — listed even if their current plan hasn\'t finished yet (shows days left on the current plan); under-19 customers are listed too, showing days until their 19th birthday','ai.stay.underage':'Under 19','ai.stay.missing.summary':'customers are missing data and aren\'t included in the counts above','ai.stay.missing.both':'Missing both ID type and Years in Korea','ai.stay.missing.idType':'ID type isn\'t Passport or ARC, or is blank','ai.stay.missing.years':'Missing Years in Korea','ai.stay.missing.dob':'Missing date of birth, so age can\'t be determined','btn.hide':'Hide','btn.show':'Show',
    'ai.stay.prepaidRecharge':'Prepaid recharge','ai.stay.prepaidRechargeAction':'Contact about recharge','ai.stay.prepaidRechargeDesc':'Prepaid customers on a 1/2/3-month plan ending soon who still have remaining stay time',
    'ai.stay.postpaidUpgrade':'Postpaid upgrade','ai.stay.postpaidUpgradeAction':'Offer new contract','ai.stay.postpaidUpgradeDesc':'Postpaid customers whose contract has ended, staying 8+ more months',
    'ai.stay.finishedNeedsRecharge':'Recharge only','ai.stay.finishedNeedsRechargeAction':'Send recharge reminder SMS','ai.stay.finishedNeedsRechargeDesc':'Prepaid customers whose plan has ended but can\'t move to postpaid yet (under 19, or staying under 8 more months) — send a text reminding them to recharge','btn.openSms':'Open SMS','btn.copySms':'Copy SMS text','toast.smsCopied':'SMS text copied',
    'ai.stay.noYearsNote':'(based on the "Years in Korea" field on each customer profile, read as expected remaining stay — customers with that field left blank won\'t appear here)',
    'ai.ask.title':'💬 Ask the AI business analyst','ai.ask.desc':'Answered from real customer data, with the calculation shown (try a suggestion below)','ai.ask.placeholder':'e.g. How many customers can upgrade this month?','ai.ask.btn':'Ask',
    'ai.opps.title':'Customer opportunities','ai.opps.desc':'Sorted by priority — click a customer to see their full AI insight',
    'ai.filter.allPriority':'All priorities','ai.filter.allTypes':'All opportunity types',
    'ai.priority.high':'High priority','ai.priority.medium':'Medium priority','ai.priority.low':'Low priority','ai.priority.none':'No action needed',
    'ai.opp.postpaid_conversion':'Prepaid → Postpaid','ai.opp.postpaid_conversion_soon':'Approaching eligibility','ai.opp.plan_review':'Contract completed','ai.opp.renewal_followup':'Renewing soon','ai.opp.id_verification':'ID needs verification','ai.opp.winback':'Lapsed / win-back',
    'ai.col.priority':'Priority','ai.col.score':'Score','ai.col.opportunity':'Opportunity','ai.col.action':'Recommended action','ai.col.currentRev':'Current revenue','ai.col.uplift':'Potential uplift',
    'ai.stat.currentRevenue':'Current monthly revenue','ai.stat.currentRevenueSub':'Across all active subscriptions','ai.stat.potentialRevenue':'Potential additional revenue','ai.stat.potentialRevenueSub':'From identified opportunities (estimate)','ai.stat.highPriority':'High-priority opportunities','ai.stat.highPrioritySub':'Customers worth contacting first','ai.stat.atRiskRevenue':'Revenue at risk','ai.stat.atRiskRevenueSub':'Monthly revenue from at-risk customers',
    'ai.topAction.postpaidNow':'prepaid customers now eligible for postpaid conversion','ai.topAction.contractDone':'postpaid customers whose contract ended and hasn\'t been actioned','ai.topAction.renewalSoon':'postpaid customers with contracts ending soon','ai.topAction.approachingAge':'customers approaching postpaid eligibility','ai.topAction.atRisk':'customers at risk of churning','ai.topAction.idVerify':'customers whose ID info needs verification',
    'ai.q.potentialRevenue':'How much potential revenue do we have from existing customers?','ai.q.howManyUpgrade':'How many customers can upgrade this month?','ai.q.prepaidToPostpaid':'How many prepaid customers can move to postpaid?','ai.q.contactToday':'Which customers should we contact today?','ai.q.bestPlan':'Which plan generates the most revenue?','ai.q.atRisk':'How many customers are at risk of leaving?','ai.q.forecast20pct':'How much revenue could we gain if 20% of eligible customers upgraded?',
    'ai.insight.title':'AI Customer Insight',
    'toast.subscriptionCancelled':'Subscription cancelled',
    'confirm.delete':'Delete this record? This cannot be undone.',
    'io.rows':'rows','io.detected':'detected',
    'tpl.title':'Carrier paper form templates','tpl.desc':'Upload a scan of the carrier application form and mark field positions — new customer data will auto-fill and print onto it','tpl.upload':'Upload new template','tpl.editor.new':'New template','tpl.editor.edit':'Edit template','tpl.name':'Template name','tpl.carrier':'Carrier','tpl.purpose':'Use for','tpl.purpose.general':'General (carrier application form)','tpl.purpose.idChange':'Information change form (Page 1 + Page 2)','tpl.page2Label':'Page 2 image','tpl.uploadHint':'Click or drag to upload a scan of the carrier form (JPG / PNG, A4 aspect ratio recommended)','tpl.canvasHint':'Click anywhere on the image to add a field, drag fields to reposition','tpl.changeImage':'Change image','tpl.fieldsList':'Fields added','tpl.noFields':'Click the image on the left to add your first field',
    'tpl.section.general':'General carrier forms','tpl.section.generalDesc':'Used for new signups, renewals and plan changes — these appear in template pickers like "New customer"','tpl.section.idChange':'Information change forms (Passport → Resident Card)','tpl.section.idChangeDesc':'One template per carrier — upload both the Page 1 and Page 2 images together here. Used only for "Information change" printing — never shown in the new-customer or general-print template lists',
    'print.preview':'Print preview','print.template':'Select template','print.includeBg':'Show background in preview (tick this if printing onto blank paper)','print.bgHint':'If the background form doesn\'t appear on paper, enable "Background graphics" in your browser\'s print dialog before printing — otherwise the background image will not be printed.',
    'prepaid3m.toggle':'Also activate a "3-month prepaid" service and print the application form',
  }
};
/* 2026-11-11 reminder tabs: clearer names + new buckets */
Object.assign(I18N.en, {'btn.editRecord':'Edit'});
Object.assign(I18N.zh, {'btn.editRecord':'编辑'});
Object.assign(I18N.en, {'sort.u19':'Under 19 only (turning 19 first)', 'col.u19':'Age · turns 19', 'sort.unpaid':'Unpaid only (biggest first)'});
Object.assign(I18N.zh, {'sort.u19':'仅未满19岁（最快满19岁优先）', 'col.u19':'年龄 · 满19岁', 'sort.unpaid':'仅未收款（金额最大优先）'});
Object.assign(I18N.en, {'ph.custName':'e.g. KIM MINJUN', 'ph.nationality':'e.g. CHINA / VIETNAM', 'ph.dob6':'e.g. 040728', 'ph.idExpiry6':'e.g. 290101', 'f.idExpiry6':'ID expiry date (6 digits YYMMDD)'});
Object.assign(I18N.zh, {'ph.custName':'例如：KIM MINJUN', 'ph.nationality':'例如：CHINA / VIETNAM', 'ph.dob6':'例如：040728', 'ph.idExpiry6':'例如：290101', 'f.idExpiry6':'证件有效期至（6位数字 YYMMDD）'});
Object.assign(I18N.en, {
  'rem.tab.today':'Today', 'rem.tab.week':'This week', 'rem.tab.overdue':'Overdue', 'rem.tab.all':'All open',
  'rem.tab.old':'Old (30+ days late)', 'rem.tab.idChange':'ID change requests', 'rem.tab.infochange':'Passport → ARC',
  'rem.copyNumber':'Copy number', 'rem.profile':'Profile', 'rem.copied':'Number copied',
});
Object.assign(I18N.zh, {
  'rem.tab.today':'今天', 'rem.tab.week':'本周', 'rem.tab.overdue':'已逾期', 'rem.tab.all':'全部待办',
  'rem.tab.old':'旧的（逾期30天以上）', 'rem.tab.idChange':'证件变更申请', 'rem.tab.infochange':'护照 → 外国人登录证',
  'rem.copyNumber':'复制号码', 'rem.profile':'客户资料', 'rem.copied':'号码已复制',
});
let LANG = localStorage.getItem(LANG_KEY) || 'zh';
function t(key){ return (I18N[LANG] && I18N[LANG][key]) || (I18N.zh[key]) || key; }

/* ---------------- data model ---------------- */
const NATIONALITIES = ['CHINA','VIETNAM','UZBEKISTAN','INDONESIA','THAILAND','PHILIPPINES','NEPAL','MONGOLIA','RUSSIA','KOREA','OTHER'];
/* postpaid-specific option sets, taken directly from the store's real Tencent Docs tracking sheet.
   Note: "svcCarrierType" (KT알뜰폰/SKT/etc) is deliberately a different field from the existing
   customer-level carrierType (SKT/KT only, used for the Preeti prepaid print form) — they serve
   different purposes and would collide if merged. */
const POSTPAID_CONTRACT_DAYS = [185, 245, 365];
const POSTPAID_COMPANIES = ['청춘','SK-SMS','모빙','Media'];
const POSTPAID_PARTNER_COMPANIES = ['LG','SK','KTM','KTSKY','LGM','SK7','MobingLG','MobingKT','MobingSK'];
const POSTPAID_CARRIER_TYPES = ['KT알뜰폰','LGU알뜰폰','SKT알뜰폰','KT','SKT','LGU'];
const POSTPAID_PLAN_OPTIONS = [
  {name:'PLAN A', fee:13900}, {name:'PLAN B', fee:17900}, {name:'PLAN C', fee:26400}, {name:'PLAN D', fee:34000},
  // 2026-11-10: added 5G EASY M; 5G PLAN A renamed 5G EASY L, 5G PLAN B renamed 5G EASY XL (same prices)
  {name:'5G EASY M', fee:16700}, {name:'5G EASY L', fee:22000}, {name:'5G EASY XL', fee:36250}, {name:'5G PLAN C', fee:30500},
  {name:'5G PLAN D', fee:34250}, {name:'5G PLAN E', fee:38750},
];
const CONTACT_METHODS = ['Wechat','Kakaotalk','INS','Phone','Other'];
/* postpaid "업무향" (work type) — from the store's real Tencent Docs single-select field */
const POSTPAID_WORK_TYPES = ['번호이동','신규가입','유심/이심변경','기타변경','일시정지','번호해지'];
/* prepaid-specific option sets */
const PREPAID_COMPANIES = ['스마텔SMS','프리티Free T','모빙Mobing','아시아Asia','벨류컨Vcnk','벨류컨SMT'];
const PAYMENT_METHODS = ['card','cash','alipay','wechat','bank transfer'];
const SIM_TYPES = ['physical','esim'];
const OCCUPATION_OPTIONS = ['Student','Worker','Professor','Other'];
/* real prepaid catalog tiers — a one-time payment, no recurring fees. 90 days is the store's
   "3-month recharge" plan and is the only one currently paired with the Preeti print template. */
const PREPAID_PLANS = [
  {days:15, price:20000, label:'Korea 15'},
  {days:30, price:30000, label:'Korea 30'},
  {days:60, price:40000, label:'Korea 60'},
  {days:90, price:55000, label:'Korea 90'},
];
// Recharge is deliberately just one option — an existing customer extending their line
// isn't shopping between plan tiers the way a new signup is, so there's no need to show
// the full catalog list. "Change to Prepaid" (a postpaid customer's first prepaid signup)
// still uses the full PREPAID_PLANS list above, since that's closer to a new signup.
const RECHARGE_PLAN = [{days:30, price:36000, label:'Recharge 30'}];
const STAFF_MEMBERS = ['Jason','Jihan','Himobile365'];
/* the store's active staff profile — persists across sessions, and is what the "Handled by"
   field on new customers defaults to (staff can still override it per-customer) */
const STAFF_PROFILE_KEY = 'himobile_active_staff';
function getActiveStaff(){
  const saved = localStorage.getItem(STAFF_PROFILE_KEY);
  return STAFF_MEMBERS.includes(saved) ? saved : 'Jason';
}
function setActiveStaff(name){
  localStorage.setItem(STAFF_PROFILE_KEY, name);
  renderStaffProfileFoot();
}
function renderStaffProfileFoot(){
  const name = getActiveStaff();
  document.getElementById('staffProfileName').textContent = name;
  document.getElementById('staffProfileBadge').textContent = name.charAt(0).toUpperCase();
}
document.getElementById('staffProfileFoot').addEventListener('click', e=>{
  e.stopPropagation();
  const pop = document.getElementById('cellPopover');
  const current = getActiveStaff();
  document.getElementById('cellPopoverTitle').textContent = LANG==='zh' ? '选择办理人' : 'Switch staff profile';
  document.getElementById('cellPopoverOptions').innerHTML = STAFF_MEMBERS.map(name=>{
    const c = sheetColorFor(STAFF_MEMBERS, name);
    const selected = name===current;
    return `<div class="cell-popover-opt ${selected?'selected':''}" style="background:${c.bg};color:${c.fg};" data-val="${escapeHtml(name)}"><span>${escapeHtml(name)}</span><span class="check">✓</span></div>`;
  }).join('');
  const rect = e.currentTarget.getBoundingClientRect();
  pop.style.left = Math.min(rect.left, window.innerWidth-270)+'px';
  pop.style.top = 'auto';
  pop.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  pop.style.display = 'block';
  pop.querySelectorAll('[data-val]').forEach(opt=>{
    opt.onclick = ()=>{ setActiveStaff(opt.dataset.val); closeCellPopover(); };
  });
});

/* ============================================================
   EDITABLE SHEET VIEW — a spreadsheet-style page where every field
   is directly editable: colored tag fields open a popover of options
   (matching the Notion/Feishu-style single-select UI), and free-text/
   number/date fields become an inline <input> on click.
   ============================================================ */
const SHEET_PILL_COLORS = [
  {bg:'#DCFCE7',fg:'#15803D'}, {bg:'#DBEAFE',fg:'#1D4ED8'}, {bg:'#FEE2E2',fg:'#B91C1C'},
  {bg:'#FEF3C7',fg:'#A16207'}, {bg:'#EDE9FE',fg:'#6D28D9'}, {bg:'#E5E7EB',fg:'#374151'},
  {bg:'#FCE7F3',fg:'#BE185D'}, {bg:'#CCFBF1',fg:'#0F766E'}, {bg:'#FFE4E6',fg:'#9F1239'},
  {bg:'#E0F2FE',fg:'#0369A1'},
];
function sheetColorFor(list, value){
  const idx = list.indexOf(value);
  return SHEET_PILL_COLORS[(idx>=0?idx:list.length) % SHEET_PILL_COLORS.length];
}
/* Builds the "X customers · ₩Y" per-payment-method breakdown HTML from a list of prepaid
   services — shared by Daily Report, Monthly Report, and the Dashboard widget so all three
   stay visually and numerically consistent rather than each having their own copy of this
   grouping logic. Postpaid isn't passed in here at all since it has no payment method
   concept the way prepaid does — every caller is expected to pre-filter to prepaid only.
   Blank/unset gets its own bucket rather than being silently dropped, since a customer with
   no payment method chosen yet is common and still needs to show up in the count. */
function paymentBreakdownHtml(prepaidServices, emptyMsg){
  const groups = {};
  prepaidServices.forEach(s=>{
    const key = PAYMENT_METHODS.includes(s.paymentMethod) ? s.paymentMethod : '';
    groups[key] = groups[key] || {count:0, sum:0};
    groups[key].count++;
    groups[key].sum += Number(s.sellingPrice)||0;
  });
  const rows = Object.entries(groups).sort((a,b)=> b[1].sum-a[1].sum);
  if(!rows.length) return `<div class="muted" style="padding:10px 4px;">${emptyMsg||(LANG==='zh'?'没有先付记录':'No prepaid signups')}</div>`;
  return rows.map(([method, v])=>{
    const label = method ? method : t('rep.daily.notSet');
    const c = method ? sheetColorFor(PAYMENT_METHODS, method) : {bg:'var(--gray-light)', fg:'var(--text-soft)'};
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 4px;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:9px;">
        <span class="pill" style="background:${c.bg};color:${c.fg};">${escapeHtml(label)}</span>
        <span class="muted" style="font-size:12.5px;">${v.count} ${LANG==='zh'?'位':(v.count===1?'customer':'customers')}</span>
      </div>
      <b>${fmtWon(v.sum)}</b>
    </div>`;
  }).join('');
}
/* Generic clickable "choose by tapping, not typing" option group — reused across the new
   postpaid customer form for every single-select field (work type, contract length, company,
   partner company, carrier type, ID type, contact method). Selection state lives on the
   container's data-selected attribute so callers don't need per-field JS state. */
function renderTileRadioGroup(containerId, options, currentVal){
  const el = document.getElementById(containerId);
  if(!el) return;
  delete el.dataset.auto; // see autoFillPostpaidFromPlan
  el.dataset.selected = currentVal || '';
  el.innerHTML = options.map(opt=>{
    const c = sheetColorFor(options, opt);
    const selected = opt===currentVal;
    return `<div class="tile-radio ${selected?'selected':''}" data-val="${escapeHtml(opt)}" style="background:${c.bg};color:${c.fg};">${escapeHtml(opt)}</div>`;
  }).join('');
}
/* Same tile-radio pattern but for the prepaid catalog specifically — the visible label
   ("15 Days · ₩20,000") is friendlier than the stored value (just the day count). */
function renderPrepaidPlanTiles(currentVal, elId, plansList){
  const el = document.getElementById(elId||'p3_prepaidPlan_group');
  if(!el) return;
  el.dataset.selected = currentVal || '';
  const plans = plansList || PREPAID_PLANS;
  const values = plans.map(p=>String(p.days));
  el.innerHTML = plans.map(p=>{
    const val = String(p.days);
    const c = sheetColorFor(values, val);
    const selected = val===currentVal;
    return `<div class="tile-radio ${selected?'selected':''}" data-val="${val}" style="background:${c.bg};color:${c.fg};">${p.days} ${LANG==='zh'?'天':'Days'} · ${fmtWon(p.price)}</div>`;
  }).join('');
}
/* Renders the 9 fixed postpaid plan names as a tile-radio group, each tile showing its
   name and monthly fee. Used by New Postpaid, Change to Postpaid, and Edit Profile
   (postpaid) — all three read this same fixed price list rather than each hand-typing a
   plan name, so pricing stays consistent no matter which flow someone uses. */
function renderPostpaidPlanTiles(elId, currentVal){
  const el = document.getElementById(elId);
  if(!el) return;
  el.dataset.selected = currentVal || '';
  const values = POSTPAID_PLAN_OPTIONS.map(p=>p.name);
  el.innerHTML = POSTPAID_PLAN_OPTIONS.map(p=>{
    const c = sheetColorFor(values, p.name);
    const selected = p.name===currentVal;
    return `<div class="tile-radio ${selected?'selected':''}" data-val="${escapeHtml(p.name)}" data-fee="${p.fee}" style="background:${c.bg};color:${c.fg};">${escapeHtml(p.name)} · ${fmtWon(p.fee)}</div>`;
  }).join('');
}
/* SIM_TYPES stores the raw 'physical'/'esim' values used everywhere else in the data model,
   but shows a properly capitalized label on the tile itself rather than the raw value. */
function renderSimTypeTiles(elId, currentVal){
  const el = document.getElementById(elId);
  if(!el) return;
  el.dataset.selected = currentVal || 'physical';
  el.innerHTML = SIM_TYPES.map(val=>{
    const c = sheetColorFor(SIM_TYPES, val);
    const selected = val===(currentVal||'physical');
    const label = val==='esim' ? 'eSIM' : t('opt.physical');
    return `<div class="tile-radio ${selected?'selected':''}" data-val="${val}" style="background:${c.bg};color:${c.fg};">${label}</div>`;
  }).join('');
}
// which Monthly Fee input each plan-name tile-radio group should auto-fill when clicked —
// selecting a named plan is meant to save re-typing the fee that plan already implies,
// while still leaving the field editable afterward for a manual adjustment
const PLAN_TILES_FEE_TARGET = {pc_plan_group:'pc_monthlyFee', cs_plan_group:'cs_monthlyFee', pe_plan_group:'pe_monthlyFee'};
document.addEventListener('click', e=>{
  const tile = e.target.closest('.tile-radio[data-fee]');
  if(!tile) return;
  const group = tile.closest('.tile-radio-group');
  const feeInputId = group && PLAN_TILES_FEE_TARGET[group.id];
  if(feeInputId){
    const feeInput = document.getElementById(feeInputId);
    if(feeInput) feeInput.value = tile.dataset.fee;
    autoFillPostpaidFromPlan(group.id.split('_')[0], tile.dataset.val);
  }
});
/* ---- Plan → Company / Partner company / Carrier type auto-fill ----
   Picking a postpaid plan fills those three fields with the combination this store has
   used MOST OFTEN for that plan (learned from its own postpaid records, current and past).
   Staff can still change any of them afterwards; picking a different plan refills them.
   POSTPAID_PLAN_DEFAULTS can pin a fixed combination for a plan — it wins over the learned
   one. Fields are only filled with values that exist in today's option lists. */
const PLAN_SET_5G_EASY = {company:'청춘', partnerCompany:'SK',     svcCarrierType:'SKT', contractLength:'365'};
const PLAN_SET_5G_LG    = {company:'청춘', partnerCompany:'LG',     svcCarrierType:'LGU', contractLength:'365'};
const PLAN_SET_KT       = {company:'청춘', partnerCompany:'KTM',    svcCarrierType:'KT',  contractLength:'245'};
const POSTPAID_PLAN_DEFAULTS = {
  '5G EASY M': PLAN_SET_5G_EASY, '5G EASY L': PLAN_SET_5G_EASY, '5G EASY XL': PLAN_SET_5G_EASY,
  '5G PLAN C': PLAN_SET_5G_LG,   '5G PLAN D': PLAN_SET_5G_LG,   '5G PLAN E': PLAN_SET_5G_LG,
  'PLAN A': PLAN_SET_KT, 'PLAN B': PLAN_SET_KT, 'PLAN C': PLAN_SET_KT, 'PLAN D': PLAN_SET_KT,
};
// renamed plans also learn from sales recorded under their old name
const POSTPAID_PLAN_ALIASES = {'5G EASY L':['5G PLAN A'], '5G EASY XL':['5G PLAN B']};
function learnedPlanDefaults(planName){
  const names = [planName, ...(POSTPAID_PLAN_ALIASES[planName]||[])];
  const tally = new Map();
  DB.services.forEach(s=>{
    if(s.type!=='postpaid' || !names.includes(s.plan)) return;
    const combo = {company: s.company||'', partnerCompany: s.partnerCompany||'', svcCarrierType: s.svcCarrierType||s.carrier||''};
    if(!combo.company && !combo.partnerCompany && !combo.svcCarrierType) return;
    const key = combo.company+'|'+combo.partnerCompany+'|'+combo.svcCarrierType;
    const cur = tally.get(key) || {combo, n:0, last:''};
    cur.n++; if((s.activationDate||'') > cur.last) cur.last = s.activationDate||'';
    tally.set(key, cur);
  });
  // most used wins; on a tie, the one sold most recently
  const best = [...tally.values()].sort((a,b)=> b.n-a.n || (b.last>a.last?1:b.last<a.last?-1:0))[0];
  return best ? {...best.combo, count: best.n} : null;
}
function autoFillPostpaidFromPlan(prefix, planName){
  if(!prefix || !planName) return;
  const fixed = POSTPAID_PLAN_DEFAULTS[planName];
  const d = fixed || learnedPlanDefaults(planName);
  const fields = [
    ['company', prefix+'_company_group', POSTPAID_COMPANIES, t('f.company')],
    ['partnerCompany', prefix+'_partnerCompany_group', POSTPAID_PARTNER_COMPANIES, t('f.partnerCompany')],
    ['svcCarrierType', prefix+'_svcCarrierType_group', POSTPAID_CARRIER_TYPES, t('f.svcCarrierType')],
    ['contractLength', prefix+'_contractLength_group', POSTPAID_CONTRACT_DAYS.map(String), t('f.contractLength')],
  ];
  // Edit Profile on a contract that has frozen days: its stored length includes them
  // (e.g. 365 + 10 = 375), so the plan default must keep those days or the freeze is lost
  let frozenExtra = 0;
  if(prefix==='pe' && typeof editingCustomerId!=='undefined' && editingCustomerId){
    const cur = activeSubscriptionFor(editingCustomerId);
    if(cur) frozenExtra = frozenDaysOf(cur);
  }
  const setField = (el, gid, opts, title, val)=>{
    if(el.dataset.options) renderCompactOptionField(gid, JSON.parse(el.dataset.options), val, el.dataset.title || title);
    else renderTileRadioGroup(gid, opts, val);
  };
  let filled = 0;
  fields.forEach(([key, gid, opts, title])=>{
    const el = document.getElementById(gid);
    if(!el) return;
    let val = d ? d[key] : '';
    if(key==='contractLength' && val && frozenExtra){
      // 375 isn't one of the tiles, but the tile group keeps any selected value — it's saved as-is
      el.dataset.selected = String(Number(val)+frozenExtra);
      el.querySelectorAll('.tile-radio').forEach(x=> x.classList.toggle('selected', x.dataset.val===val));
      el.dataset.auto = el.dataset.selected; filled++;
      return;
    }
    if(val && opts.includes(val)){
      setField(el, gid, opts, title, val);
      el.dataset.auto = val; // remembered so a later plan switch can undo only OUR fill
      filled++;
    } else if(el.dataset.auto && el.dataset.auto===el.dataset.selected){
      // this value came from the previous plan's auto-fill (not picked by hand) and the new
      // plan has no known default → clear it rather than leave a wrong carrier/company
      setField(el, gid, opts, title, '');
    }
  });
  if(filled && d){
    toast(fixed
      ? (LANG==='zh' ? `已按「${planName}」自动填写公司、合作公司、通信社类型和合约期限，可手动修改` : `Company, partner, carrier and contract length filled in for ${planName} — change them if needed`)
      : (LANG==='zh' ? `已按以往 ${d.count} 笔「${planName}」填写公司、合作公司和通信社类型，可手动修改` : `Company, partner and carrier filled in from ${d.count} past ${planName} sale(s) — change them if needed`));
  }
}
// Which currency badge each payment-method tile-radio group controls — Alipay and WeChat
// Pay are Chinese payment methods, so the price next to them is switched to show ¥ (RMB)
// instead of ₩ (KRW) as a visual cue for whoever's entering the amount. This only changes
// the currency SYMBOL shown, never the number itself — staff still type in whatever amount
// was actually agreed, in whichever currency that turned out to be; nothing is converted.
const PAYMENT_CURRENCY_TARGET = {p3_paymentMethod_group:'p3_currencyBadge', pa_paymentMethod_group:'pa_currencyBadge'};
function updateCurrencyBadgeFor(groupId){
  const badgeId = PAYMENT_CURRENCY_TARGET[groupId];
  if(!badgeId) return;
  const badge = document.getElementById(badgeId);
  const selected = document.getElementById(groupId)?.dataset.selected;
  if(badge) badge.textContent = (selected==='alipay' || selected==='wechat') ? '¥' : '₩';
}
document.addEventListener('click', e=>{
  const tile = e.target.closest('.tile-radio-group[id$="paymentMethod_group"] .tile-radio');
  if(!tile) return;
  const group = tile.closest('.tile-radio-group');
  if(group) setTimeout(()=> updateCurrencyBadgeFor(group.id), 0); // after the click handler that sets dataset.selected runs
});
/* Compact alternative to a full tile-radio-group: a single button showing the current
   choice, click it and every option shows up in a popover (same interaction as Sheet
   View's tag cells) — keeps a form with many option fields from sprawling down the page.
   Selection state is stored the same way as a real tile-radio-group (dataset.selected on
   the container), so nothing about how a form reads its saved value needs to change. */
function renderCompactOptionField(groupId, options, currentVal, title){
  const el = document.getElementById(groupId);
  if(!el) return;
  delete el.dataset.auto; // see autoFillPostpaidFromPlan
  el.dataset.selected = currentVal || '';
  el.dataset.options = JSON.stringify(options);
  el.dataset.title = title;
  const c = currentVal ? sheetColorFor(options, currentVal) : null;
  el.innerHTML = `<button type="button" class="option-field-btn ${currentVal?'chosen':''}" style="${currentVal?`background:${c.bg};color:${c.fg};`:''}" data-option-trigger>${escapeHtml(currentVal || (LANG==='zh'?'点击选择':'Click to choose'))}<span class="arrow">▾</span></button>`;
}
function closeFormOptionPopover(){ document.getElementById('cellPopover').style.display = 'none'; }
function openFormOptionPopover(triggerBtn){
  const group = triggerBtn.closest('.tile-radio-group');
  if(!group) return;
  const options = JSON.parse(group.dataset.options||'[]');
  const current = group.dataset.selected || '';
  const pop = document.getElementById('cellPopover');
  document.getElementById('cellPopoverTitle').textContent = group.dataset.title || '';
  document.getElementById('cellPopoverOptions').innerHTML = options.map(opt=>{
    const c = sheetColorFor(options, opt);
    const selected = opt===current;
    return `<div class="cell-popover-opt ${selected?'selected':''}" style="background:${c.bg};color:${c.fg};" data-val="${escapeHtml(opt)}"><span>${escapeHtml(opt)}</span><span class="check">✓</span></div>`;
  }).join('');
  const rect = triggerBtn.getBoundingClientRect();
  pop.style.left = Math.min(rect.left, window.innerWidth-270)+'px';
  pop.style.bottom = 'auto';
  pop.style.top = (rect.bottom+6)+'px';
  pop.style.display = 'block';
  pop.querySelectorAll('[data-val]').forEach(opt=>{
    opt.onclick = ()=>{
      renderCompactOptionField(group.id, options, opt.dataset.val, group.dataset.title);
      closeFormOptionPopover();
      // the prepaid Company/Carrier fields depend on which plan tier is selected — keep
      // that filtering in sync if this popover belongs to the prepaid form
      if(group.id==='p3_company_group' || group.id==='p3_svcCarrierType_group') updatePrepaidPriceFromPlan();
    };
  });
}
document.addEventListener('click', e=>{
  const trigger = e.target.closest('[data-option-trigger]');
  if(trigger){ openFormOptionPopover(trigger); return; }
  if(!e.target.closest('#cellPopover') && !e.target.closest('[data-option-trigger]') && !e.target.closest('[data-sheet-select]')) closeFormOptionPopover();
});
document.addEventListener('click', e=>{
  const tile = e.target.closest('.tile-radio');
  if(!tile) return;
  const group = tile.closest('.tile-radio-group');
  if(!group) return;
  group.dataset.selected = tile.dataset.val;
  group.querySelectorAll('.tile-radio').forEach(t=> t.classList.toggle('selected', t===tile));
});
/* Renders a colored, clickable pill for a single-select field. `recordType` is 'customer'
   or 'service'; clicking it opens a popover with all `options`, and picking one writes
   straight back to the record and re-renders that cell in place. */
/* Sheet View pill colours (2026-11-11) — match the other tables instead of a different
   colour per value: Company / Carrier type / Partner company in the blue accent (the fields
   staff check most), payment method in the same colours as the Reports payment breakdown,
   everything else a calm neutral pill. */
const SHEET_ACCENT_FIELDS = ['company','svcCarrierType','partnerCompany'];
function sheetPillColour(field, options, value){
  if(SHEET_ACCENT_FIELDS.includes(field)) return {bg:'var(--blue-light)', fg:'var(--blue)'};
  if(field==='paymentMethod') return sheetColorFor(options, value);
  return {bg:'var(--gray-light)', fg:'var(--text)'};
}
function sheetPillCell(recordType, recordId, field, value, options, title){
  const c = value ? sheetPillColour(field, options, value) : null;
  const label = value ? escapeHtml(value) : '—';
  const style = value ? `background:${c.bg};color:${c.fg};` : '';
  return `<span class="sheet-pill ${value?'':'empty'}" style="${style}"
    data-sheet-select data-record-type="${recordType}" data-record-id="${recordId}" data-field="${field}"
    data-options='${escapeHtml(JSON.stringify(options))}' data-title="${escapeHtml(title)}">${label}</span>`;
}
/* Renders a free-text/number/date field that turns into an inline input on click. */
function sheetTextCell(recordType, recordId, field, value, inputType){
  const display = value===null||value===undefined||value===''? '—' : escapeHtml(String(value));
  return `<span class="sheet-text" data-sheet-text data-record-type="${recordType}" data-record-id="${recordId}"
    data-field="${field}" data-input-type="${inputType||'text'}" data-value="${escapeHtml(value==null?'':value)}">${display}</span>`;
}
function sheetReadonlyCell(text){
  return `<span class="sheet-readonly">${escapeHtml(text==null?'—':String(text))}</span>`;
}
function sheetRecordFor(type, id){ return type==='customer' ? getCustomer(id) : getService(id); }
/* Copies a customer's name straight to the clipboard from their row in Sheet View — for
   pasting into a messaging app, search box, print form, etc. without having to manually
   select the text first. Briefly swaps the button's icon to a checkmark as confirmation,
   since clipboard writes have no other visible feedback of their own. */
async function copyCustomerNameToClipboard(customerId, btnEl){
  const cust = getCustomer(customerId);
  if(!cust) return;
  try{
    await navigator.clipboard.writeText(cust.name);
    if(btnEl){
      const original = btnEl.textContent;
      btnEl.textContent = '✓';
      btnEl.classList.add('copied');
      setTimeout(()=>{ btnEl.textContent = original; btnEl.classList.remove('copied'); }, 1200);
    }
  }catch(err){
    // clipboard access can be blocked (e.g. insecure context, browser permission) — falls
    // back to the toast so the person still sees SOMETHING happened, even if not a silent copy
    toast(LANG==='zh'?'无法复制，请手动选择姓名':'Couldn\'t copy — please select the name manually');
  }
}
/* single choke point for writing a sheet edit back to the data model, keeping expiry dates
   in sync when activation date or contract length changes on a service */
/* Deferring the table rebuild after a commit (rather than doing it immediately) protects
   the click that triggered this commit in the first place — see the comment where this is
   called for why. But the deferred call itself would still eventually run and could wipe
   out an edit on a DIFFERENT cell that the person had already moved on to and started
   typing into in the meantime, since a full rebuild has no way to know about an in-progress,
   not-yet-committed edit elsewhere. Skipping the rebuild whenever that's the case is safe:
   the data from THIS commit is already saved, and whatever cell is now being edited will
   trigger its own rebuild once it, too, gets committed. */
// Set the instant a mousedown lands on any editable cell — deliberately BEFORE the click
// that follows it, and before any blur it triggers on a currently-open input. This is what
// lets the deferred rebuild below correctly recognize "someone is already mid-interaction
// with a different cell", even in the split second where that interaction has only gotten
// as far as mousedown and hasn't produced a live .sheet-text-input yet — checking only for
// an existing input/popover was too late to see that, since it runs before the SECOND
// click has had a chance to actually open anything.
let sheetMouseDownAt = 0;
document.addEventListener('mousedown', e=>{
  if(e.target.closest('#sheetTable [data-sheet-text], #sheetTable [data-sheet-select]')) sheetMouseDownAt = Date.now();
}, true);
function deferredSheetRerender(){
  const attempt = ()=>{
    const recentMouseDown = (Date.now()-sheetMouseDownAt) < 400; // a click sequence is still plausibly in flight
    const activeEdit = document.querySelector('.sheet-text-input') || document.getElementById('cellPopover')?.style.display==='block';
    if(activeEdit || recentMouseDown){ setTimeout(attempt, 150); return; } // retry rather than give up — the
    // rebuild still needs to happen eventually so derived cells like Final Price catch up
    renderSheetPage();
  };
  setTimeout(attempt, 0);
}
function sheetCommitEdit(recordType, recordId, field, value){
  const rec = sheetRecordFor(recordType, recordId);
  if(!rec) return;
  rec[field] = value;
  if(recordType==='service' && (field==='activationDate' || field==='durationDays')){
    if(rec.activationDate && rec.durationDays){
      const d = new Date(rec.activationDate); d.setDate(d.getDate()+Number(rec.durationDays));
      rec.expiryDate = d.toISOString().slice(0,10);
    }
  }
  // prepaid's Final Price column is derived, not directly editable — editing either Price
  // or Discount here recomputes sellingPrice/received (the app's actual revenue fields)
  // the same way the New Customer form's live preview already does
  if(recordType==='service' && rec.type==='prepaid' && (field==='price' || field==='discount')){
    const finalPrice = Math.max(0, (Number(rec.price)||0) - (Number(rec.discount)||0));
    rec.sellingPrice = finalPrice;
    rec.received = finalPrice;
  }
  // "Carrier" and "Carrier Type" were merged into a single visible column (Carrier Type) —
  // keep the older internal "carrier" field matching it, since a few other places (print
  // templates, older history entries) may still read that field directly
  if(recordType==='service' && field==='svcCarrierType'){
    rec.carrier = value;
  }
  saveDB(DB);
  renderNav();
}
document.getElementById('cellPopover').addEventListener('click', e=> e.stopPropagation());
document.addEventListener('click', e=>{
  if(!e.target.closest('#cellPopover') && !e.target.closest('[data-sheet-select]') && !e.target.closest('[data-option-trigger]')) closeCellPopover();
  if(!e.target.closest('#statBreakdownPopover') && !e.target.closest('[data-stat-breakdown]')) document.getElementById('statBreakdownPopover').style.display = 'none';
});
document.getElementById('statBreakdownPopover').addEventListener('click', e=> e.stopPropagation());
function closeCellPopover(){ document.getElementById('cellPopover').style.display = 'none'; }
function openCellPopoverFor(anchorEl){
  const recordType = anchorEl.dataset.recordType, recordId = anchorEl.dataset.recordId, field = anchorEl.dataset.field;
  const options = JSON.parse(anchorEl.dataset.options);
  const current = sheetRecordFor(recordType, recordId)?.[field] || '';
  const pop = document.getElementById('cellPopover');
  document.getElementById('cellPopoverTitle').textContent = anchorEl.dataset.title || field;
  document.getElementById('cellPopoverOptions').innerHTML = options.map(opt=>{
    const c = sheetColorFor(options, opt);
    const selected = opt===current;
    return `<div class="cell-popover-opt ${selected?'selected':''}" style="background:${c.bg};color:${c.fg};" data-val="${escapeHtml(opt)}"><span>${escapeHtml(opt)}</span><span class="check">✓</span></div>`;
  }).join('') + `<div class="cell-popover-clear" data-val="">${LANG==='zh'?'清除':'Clear'}</div>`;
  const rect = anchorEl.getBoundingClientRect();
  pop.style.left = Math.min(rect.left, window.innerWidth-270)+'px';
  pop.style.bottom = 'auto';
  pop.style.top = (rect.bottom+6)+'px';
  pop.style.display = 'block';
  pop.querySelectorAll('[data-val]').forEach(opt=>{
    opt.onclick = ()=>{
      sheetCommitEdit(recordType, recordId, field, opt.dataset.val);
      closeCellPopover();
      // deferred for the same reason as the text-cell version above — a fast second click
      // elsewhere right after this one could otherwise race against this rebuild
      deferredSheetRerender();
    };
  });
}
function beginSheetTextEdit(anchorEl){
  const recordType = anchorEl.dataset.recordType, recordId = anchorEl.dataset.recordId, field = anchorEl.dataset.field;
  const inputType = anchorEl.dataset.inputType;
  const current = anchorEl.dataset.value || '';
  const input = document.createElement('input');
  input.className = 'sheet-text-input';
  input.type = inputType==='number' ? 'number' : (inputType==='date' ? 'date' : 'text');
  input.value = current;
  anchorEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const val = inputType==='number' ? (Number(input.value)||0) : input.value.trim();
    sheetCommitEdit(recordType, recordId, field, val);
    // Converts THIS cell back to its display form immediately and directly — independent
    // of whatever else might currently be happening elsewhere in the table (like someone
    // having already moved on to a different cell). Without this, if the later full
    // rebuild below ends up skipped because another cell is mid-edit, this input would be
    // left dangling in the DOM as a second, orphaned .sheet-text-input — which is exactly
    // what caused edits to silently land on the wrong record before this fix.
    if(input.isConnected){
      const rec = sheetRecordFor(recordType, recordId);
      const temp = document.createElement('div');
      temp.innerHTML = sheetTextCell(recordType, recordId, field, rec?.[field], inputType);
      input.replaceWith(temp.firstElementChild);
    }
    // Deferred rather than called immediately: this blur handler can fire because the user
    // clicked directly into a DIFFERENT cell (not Enter, not clicking somewhere neutral).
    // If the table rebuild happened synchronously right here, it would destroy the DOM
    // node that second click's mousedown was tracking before its mouseup ever arrives —
    // browsers cancel the click entirely when that happens, since they can no longer
    // confirm mousedown and mouseup landed on the same element. The data is already safely
    // committed above either way; only the visual refresh (for derived fields like Final
    // Price) needs to wait a tick so the second click has a chance to land and start its
    // own edit.
    deferredSheetRerender();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e=>{
    if(e.key==='Enter') input.blur();
    if(e.key==='Escape'){ input.removeEventListener('blur', commit); renderSheetPage(); }
  });
}
document.getElementById('sheetTable').addEventListener('click', e=>{
  // Clicking directly from one editable cell into another (rather than pressing Enter or
  // clicking somewhere neutral first) fires the first cell's blur-triggered commit AND
  // re-render in the middle of handling this same click. That replaces the whole table's
  // HTML, which can leave e.target pointing at a node that's already been detached by the
  // time this handler actually runs — silently swallowing the second click entirely, which
  // is exactly what made it look like repeated edits kept reverting: the second cell's edit
  // never actually started, so its later value never overwrote anything, while the FIRST
  // cell's edit (which did commit) simply displayed correctly on visible fresh re-renders,
  // giving the impression the last cell you touched "won" unpredictably. Re-querying by the
  // same identifying attributes on a fresh, live element fixes this for both cell types.
  const pillEl = e.target.closest('[data-sheet-select]');
  if(pillEl){
    const live = pillEl.isConnected ? pillEl : findFreshSheetCell(pillEl, '[data-sheet-select]');
    if(live) openCellPopoverFor(live);
    return;
  }
  const textEl = e.target.closest('[data-sheet-text]');
  if(textEl){
    const live = textEl.isConnected ? textEl : findFreshSheetCell(textEl, '[data-sheet-text]');
    if(live) beginSheetTextEdit(live);
    return;
  }
});
function findFreshSheetCell(staleEl, selectorPrefix){
  const {recordType, recordId, field} = staleEl.dataset;
  return document.querySelector(`${selectorPrefix}[data-record-type="${recordType}"][data-record-id="${recordId}"][data-field="${field}"]`);
}
document.getElementById('sheetSearch').addEventListener('input', renderSheetPage);
document.getElementById('sheetNationalityFilter').addEventListener('change', renderSheetPage);
document.getElementById('sheetRatingFilter').addEventListener('change', renderSheetPage);
document.getElementById('sheetRecentFilter').addEventListener('change', renderSheetPage);
document.getElementById('sheetSortOrder').addEventListener('change', renderSheetPage);
document.getElementById('sheetExtraFilter').addEventListener('change', e=>{ sheetExtraFilterVals[sheetTypeTab] = e.target.value; renderSheetPage(); });
document.getElementById('sheetDateFrom').addEventListener('change', renderSheetPage);
document.getElementById('sheetDateTo').addEventListener('change', renderSheetPage);
document.getElementById('sheetDateRangeClear').addEventListener('click', ()=>{
  document.getElementById('sheetDateFrom').value = '';
  document.getElementById('sheetDateTo').value = '';
  renderSheetPage();
});

let sheetTypeTab = 'prepaid';
function renderSheetPage(){
  // Rebuilding the table's HTML on every edit (needed so derived columns like Final Price
  // stay in sync) was silently resetting the horizontal scroll position to something
  // unpredictable — editing a cell far to the right (like Payment Method, one of the
  // rightmost columns) would visibly snap the table back, looking exactly like the rows
  // themselves had jumped. Saving and restoring both scroll axes around the rebuild fixes
  // this without needing to change how or when the table actually re-renders.
  const scrollWrap = document.querySelector('.sheet-tbl-wrap');
  const savedScrollLeft = scrollWrap?.scrollLeft;
  const savedScrollTop = scrollWrap?.scrollTop;
  const dupeGroupsRaw = getDuplicateGroups();
  const dupeGroupsForTabCount = dupeGroupsRaw.map(g=>[...g].sort((a,b)=> new Date(customerJoinDate(b)||0)-new Date(customerJoinDate(a)||0)))
    .sort((a,b)=> new Date(customerJoinDate(b[0])||0)-new Date(customerJoinDate(a[0])||0));
  const tabs = [
    {key:'all', label:'custtab.all', n:DB.customers.length},
    {key:'prepaid', label:'custtab.prepaid', n:DB.customers.filter(c=>{const a=activeSubscriptionFor(c.id); return a && a.type==='prepaid';}).length},
    {key:'postpaid', label:'custtab.postpaid', n:DB.customers.filter(c=>{const a=activeSubscriptionFor(c.id); return a && a.type==='postpaid';}).length},
    {key:'inactive', label:'custtab.inactive', n:DB.customers.filter(c=>!activeSubscriptionFor(c.id)).length},
    {key:'dupes', label:'custtab.dupes', n:dupeGroupsForTabCount.reduce((n,g)=>n+g.length,0)},
  ];
  document.getElementById('sheetTypeTabs').innerHTML = tabs.map(tb=>`<button class="chip-tab ${sheetTypeTab===tb.key?'active':''} ${tb.key==='dupes'&&tb.n?'chip-tab-warn':''}" data-sheettab="${tb.key}">${t(tb.label)} <span class="n">${tb.n}</span></button>`).join('');
  document.querySelectorAll('[data-sheettab]').forEach(b=> b.addEventListener('click', ()=>{ sheetTypeTab=b.dataset.sheettab; renderSheetPage(); }));

  // nationality filter options — only populate once, preserving whatever's selected
  const natSel = document.getElementById('sheetNationalityFilter');
  { const prev = natSel.value; natSel.innerHTML = `<option value="">${t('filter.allNationalities')}</option>` + NATIONALITIES.map(n=>`<option value="${n}">${n}</option>`).join(''); natSel.value = prev; }
  const ratingSel = document.getElementById('sheetRatingFilter');
  { const prev = ratingSel.value; ratingSel.innerHTML = `<option value="">${t('filter.allRatings')}</option>` + [5,4,3,2,1].map(r=>`<option value="${r}">${'★'.repeat(r)}</option>`).join(''); ratingSel.value = prev; }
  // Prepaid tab: Carrier type filter · Postpaid tab: Partner company filter · other tabs: rating.
  // A real filter now (it used to hide rows after drawing, so the customer count ignored it).
  const extraSel = document.getElementById('sheetExtraFilter');
  const extraOn = sheetTypeTab==='prepaid' || sheetTypeTab==='postpaid';
  ratingSel.style.display = extraOn ? 'none' : '';
  extraSel.style.display = extraOn ? '' : 'none';
  if(extraOn){
    if(ratingSel.value) ratingSel.value = '';
    const key = sheetTypeTab==='prepaid' ? 'svcCarrierType' : 'partnerCompany';
    const opts = [...new Set(DB.services.filter(x=>x.type===sheetTypeTab).map(x=>String(x[key]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const allLabel = sheetTypeTab==='prepaid' ? (LANG==='zh'?'全部运营商类型':'All carrier types') : (LANG==='zh'?'全部合作公司':'All partner companies');
    const html = `<option value="">${allLabel}</option>` + opts.map(o=>`<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
    if(extraSel.dataset.sig !== sheetTypeTab+'|'+LANG+'|'+html.length){ extraSel.innerHTML = html; extraSel.dataset.sig = sheetTypeTab+'|'+LANG+'|'+html.length; }
    extraSel.value = sheetExtraFilterVals[sheetTypeTab] || '';
  }
  const extraFilter = extraOn ? (sheetExtraFilterVals[sheetTypeTab] || '') : '';
  const natFilter = natSel.value;
  const ratingFilter = ratingSel.value;
  const recentFilter = document.getElementById('sheetRecentFilter').value;
  const search = (document.getElementById('sheetSearch').value||'').toLowerCase();
  const sortOrder = document.getElementById('sheetSortOrder').value;
  const dateFrom = document.getElementById('sheetDateFrom').value;
  const dateTo = document.getElementById('sheetDateTo').value;
  // visibly highlights the date-range pill whenever it's actively filtering, so it's never
  // silently left on and forgotten — the same kind of confusion that's happened before with
  // other filters left set from an earlier search
  document.getElementById('sheetDateRangePill').classList.toggle('active', !!(dateFrom || dateTo));
  if(window.dateRangeLabel) dateRangeLabel(); // the one-button range picker's text

  // Inactive / Duplicate / All don't have a single "current plan" to show in the
  // editable-spreadsheet format the way Prepaid/Postpaid do — those tabs render a simpler,
  // read-only summary table instead of the editable financial columns, sharing the same
  // filter values above.
  if(sheetTypeTab==='inactive' || sheetTypeTab==='dupes' || sheetTypeTab==='all'){
    renderSheetSimpleView(sheetTypeTab, dupeGroupsForTabCount, {natFilter, ratingFilter, recentFilter, search, dateFrom, dateTo, sortOrder});
    if(scrollWrap && savedScrollLeft!==undefined){
      scrollWrap.scrollLeft = savedScrollLeft;
      scrollWrap.scrollTop = savedScrollTop;
    }
    return;
  }

  let rows = DB.customers.map(c=>({c, svc:activeSubscriptionFor(c.id)})).filter(({svc})=> svc && svc.type===sheetTypeTab);
  rows = rows.filter(({c, svc})=>{
    if(natFilter && c.nationality!==natFilter) return false;
    if(ratingFilter && String(c.rating)!==ratingFilter) return false;
    // check THIS ROW'S service activation date, not the customer's overall join date —
    // a customer's record can be created at a very different time than a specific service
    // shown here (e.g. imported historical data), so those two dates can genuinely differ
    if(dateFrom || dateTo){ if(!matchesDateRange(svc.activationDate, dateFrom, dateTo)) return false; }
    else if(recentFilter){ if(!matchesRecentFilter(svc.activationDate, recentFilter)) return false; }
    if(search){
      const hay = [c.name,c.phone,c.nationality,c.idNumber].join(' ').toLowerCase();
      if(!hay.includes(search)) return false;
    }
    if(extraFilter && String((sheetTypeTab==='prepaid' ? svc.svcCarrierType : svc.partnerCompany)||'').trim()!==extraFilter) return false;
    if(sortOrder==='u19' && !isUnder19(c)) return false;
    if(sortOrder==='unpaid' && !(customerUnpaid(c) > 0)) return false;
    return true;
  })
  .sort((a,b)=>{
    if(sortOrder==='unpaid') return customerUnpaid(b.c) - customerUnpaid(a.c); // biggest first
    if(sortOrder==='u19') return String(a.c.dob).localeCompare(String(b.c.dob)); // oldest first = turns 19 soonest
    if(sortOrder==='az') return a.c.name.localeCompare(b.c.name);
    if(sortOrder==='za') return b.c.name.localeCompare(a.c.name);
    // default: newest ACTIVATION DATE first — matches what's actually shown in the
    // Activation Date column. Previously sorted by the customer's overall record date
    // instead, which is a different thing (e.g. a customer whose record is from months
    // ago but who recharged today) — the table's default order looked wrong because it
    // didn't match the column people were actually looking at.
    return new Date(b.svc.activationDate||0)-new Date(a.svc.activationDate||0);
  });
  document.getElementById('sheetCount').textContent = `${rows.length} ${LANG==='zh'?'位客户':'customers'}${sortOrder==='u19'?(LANG==='zh'?' · 未满19岁':' under 19'):''}${sortOrder==='unpaid'?(LANG==='zh'?` · 未收款 ${fmtWon(rows.reduce((a,r)=>a+customerUnpaid(r.c),0))}`:` with unpaid balance · ${fmtWon(rows.reduce((a,r)=>a+customerUnpaid(r.c),0))}`):''}`;
  const u19 = sortOrder==='u19';
  const unpaid = sortOrder==='unpaid';

  /* Column order (2026-11-11): what staff check first comes first — name, phone, then
     Company / Carrier type and the plan-length tag (prepaid) or plan name / partner
     (postpaid), then dates and status. Rarely-filled fields (plan type, ID…) move right.
     Cells carry data-col so filters never depend on a column's position. */
  const usedCell = svc => sheetReadonlyCell((usedDaysFor(svc)??'—')+(usedDaysFor(svc)!==null?(LANG==='zh'?' 天':' d'):''));
  // same pill colours as the Status column in the other tables: green in contract, orange in
  // the last 7 days, red expired (prepaid), calm blue over contract (postpaid keeps working)
  const statusCell = svc => {
    const txt = contractStatusTextFor(svc, true);
    if(!txt || !svc.expiryDate) return sheetReadonlyCell('—');
    const rem = daysBetween(todayISO(), svc.expiryDate);
    const cls = rem < 0 ? (svc.type==='postpaid' ? 'pill-blue' : 'pill-red') : rem <= 7 ? 'pill-orange' : 'pill-green';
    return `<span class="pill ${cls} sheet-status">${escapeHtml(txt)}</span>`;
  };
  const nameCell = c => `<td class="name-cell sheet-name" title="${escapeHtml(c.name)}" style="cursor:pointer;" data-open-customer="${c.id}"><span class="avatar">${initials(c.name)}</span><span class="name-text">${escapeHtml(c.name)}</span><button class="copy-name-btn" data-copy-name="${c.id}" title="${t('btn.copyName')}">📋</button></td>`;
  const u19Head = u19 ? `<th>${t('col.u19')}</th>` : unpaid ? `<th>${t('col.outstanding')}</th>` : '';
  const prepaidHead = `<th class="sheet-name-th">${t('col.customer')}</th>${u19Head}<th>${t('f.phone')}</th><th>${t('f.company')}</th><th>${t('f.svcCarrierType')}</th><th>${LANG==='zh'?'套餐':'Plan'}</th>
    <th>${t('f.activationDate')}</th><th>${t('f.expiryDate')}</th><th>${t('col.contractStatus')}</th><th>${t('f.usedDays')}</th><th>${t('f.durationDays')}</th>
    <th>${t('f.price')}</th><th>${t('f.discount')}</th><th>${t('f.finalPrice')}</th><th>${t('f.paymentMethod')}</th><th>${t('f.planType')}</th>
    <th>${t('f.idType')}</th><th>${t('f.idNumber')}</th><th>${t('f.dob')}</th><th>${t('f.nationality')}</th><th>${t('f.years')}</th><th>${t('f.occupation')}</th><th>${t('f.handlerName')}</th><th>${t('f.simType')}</th>`;
  const postpaidHead = `<th class="sheet-name-th">${t('col.customer')}</th>${u19Head}<th>${t('f.phone')}</th><th>${t('f.plan')}</th><th>${t('f.company')}</th><th>${t('f.partnerCompany')}</th><th>${t('f.svcCarrierType')}</th>
    <th>${t('f.activationDate')}</th><th>${t('f.expiryDate')}</th><th>${t('col.contractStatus')}</th><th>${t('f.usedDays')}</th><th>${t('f.contractLength')}</th><th>${t('freeze.colHeader')}</th>
    <th>${t('f.monthlyFee')}</th><th>${t('f.expectedProfit')}</th><th>${t('f.actualProfit')}</th><th>${t('f.usimFee')}</th><th>${t('f.discountPerMonth')}</th><th>${t('f.discountMonths')}</th><th>${t('f.netExpectedProfit')}</th><th>${t('f.actualIncome')}</th>
    <th>${t('f.planType')}</th><th>${t('f.dob')}</th><th>${t('f.nationality')}</th><th>${t('f.years')}</th><th>${t('f.occupation')}</th><th>${t('f.handlerName')}</th><th>${t('f.simType')}</th>`;

  document.getElementById('sheetTable').innerHTML = `<thead><tr>${sheetTypeTab==='prepaid'?prepaidHead:postpaidHead}</tr></thead><tbody>${
    rows.length ? rows.map(({c,svc})=>{
      const planTypeCell = `<td>${sheetPillCell('customer',c.id,'planType',c.planType,['신규가입','번호이동','명의변경','기간연장','선불전환'], t('f.planType'))}</td>`;
      if(sheetTypeTab==='prepaid'){
        const finalPrice = Math.max(0, (Number(svc.price)||0) - (Number(svc.discount)||0));
        return `<tr>${nameCell(c)}${u19 ? u19Cell(c) : unpaid ? unpaidCell(customerUnpaid(c)) : ''}
          <td>${sheetTextCell('customer',c.id,'phone',c.phone,'text')}</td>
          <td data-col="company">${sheetPillCell('service',svc.id,'company',svc.company,PREPAID_COMPANIES, t('f.company'))}</td>
          <td data-col="svcCarrierType">${sheetPillCell('service',svc.id,'svcCarrierType',svc.svcCarrierType,POSTPAID_CARRIER_TYPES, t('f.svcCarrierType'))}</td>
          <td>${sheetPlanTagHtml(svc)}</td>
          <td>${sheetTextCell('service',svc.id,'activationDate',svc.activationDate,'date')}</td>
          <td>${sheetTextCell('service',svc.id,'expiryDate',svc.expiryDate,'date')}</td>
          <td>${statusCell(svc)}</td>
          <td>${usedCell(svc)}</td>
          <td>${sheetTextCell('service',svc.id,'durationDays',svc.durationDays,'number')}</td>
          <td>${sheetTextCell('service',svc.id,'price',svc.price,'number')}</td>
          <td>${sheetTextCell('service',svc.id,'discount',svc.discount,'number')}</td>
          <td>${sheetReadonlyCell(fmtWon(finalPrice))}</td>
          <td>${sheetPillCell('service',svc.id,'paymentMethod',svc.paymentMethod,PAYMENT_METHODS, t('f.paymentMethod'))}</td>
          ${planTypeCell}
          <td>${sheetPillCell('customer',c.id,'idType',c.idType,['ARC','Passport'], t('f.idType'))}</td>
          <td>${sheetTextCell('customer',c.id,'idNumber',c.idNumber,'text')}</td>
          <td>${sheetTextCell('customer',c.id,'dob',c.dob,'date')}</td>
          <td>${sheetPillCell('customer',c.id,'nationality',c.nationality,NATIONALITIES, t('f.nationality'))}</td>
          <td>${sheetTextCell('customer',c.id,'years',c.years,'number')}</td>
          <td>${sheetTextCell('customer',c.id,'occupation',c.occupation,'text')}</td>
          <td>${sheetPillCell('customer',c.id,'handlerName',c.handlerName,STAFF_MEMBERS, t('f.handlerName'))}</td>
          <td>${sheetPillCell('service',svc.id,'simType',svc.simType,SIM_TYPES, t('f.simType'))}</td>
        </tr>`;
      }
      const frozenNow = isServiceCurrentlyFrozen(svc);
      return `<tr${frozenNow ? ' style="background:#EFF6FF;"' : ''}>${nameCell(c)}${u19 ? u19Cell(c) : unpaid ? unpaidCell(customerUnpaid(c)) : ''}
        <td>${sheetTextCell('customer',c.id,'phone',c.phone,'text')}</td>
        <td>${svc.plan ? `<span class="plan-name-chip">${escapeHtml(svc.plan)}</span>` : sheetReadonlyCell('—')}</td>
        <td data-col="company">${sheetPillCell('service',svc.id,'company',svc.company,POSTPAID_COMPANIES, t('f.company'))}</td>
        <td data-col="partnerCompany">${sheetPillCell('service',svc.id,'partnerCompany',svc.partnerCompany,POSTPAID_PARTNER_COMPANIES, t('f.partnerCompany'))}</td>
        <td data-col="svcCarrierType">${sheetPillCell('service',svc.id,'svcCarrierType',svc.svcCarrierType,POSTPAID_CARRIER_TYPES, t('f.svcCarrierType'))}</td>
        <td>${sheetTextCell('service',svc.id,'activationDate',svc.activationDate,'date')}</td>
        <td>${sheetTextCell('service',svc.id,'expiryDate',svc.expiryDate,'date')}</td>
        <td>${statusCell(svc)}</td>
        <td>${usedCell(svc)}</td>
        <td>${sheetPillCell('service',svc.id,'durationDays',svc.durationDays?String(svc.durationDays):'',POSTPAID_CONTRACT_DAYS.map(String), t('f.contractLength'))}</td>
        <td>${frozenNow ? `<button class="btn btn-sm" style="background:#2563EB;color:#fff;border:none;" data-freeze-toggle="${svc.customerId}">🧊 ${t('btn.unfreezeSim')}</button>` : sheetReadonlyCell('—')}</td>
        <td>${sheetTextCell('service',svc.id,'monthlyFee',svc.monthlyFee,'number')}</td>
        <td>${sheetTextCell('service',svc.id,'expectedProfit',svc.expectedProfit,'number')}</td>
        <td>${sheetTextCell('service',svc.id,'actualProfit',svc.actualProfit,'number')}</td>
        <td>${sheetTextCell('service',svc.id,'usimFee',svc.usimFee,'number')}</td>
        <td>${sheetTextCell('service',svc.id,'discountPerMonth',svc.discountPerMonth,'number')}</td>
        <td>${sheetTextCell('service',svc.id,'discountMonths',svc.discountMonths,'number')}</td>
        <td>${sheetReadonlyCell(fmtWon(expectedIncomeFor(svc)))}</td>
        <td>${sheetReadonlyCell(svc.actualProfit ? fmtWon(netProfitFor(svc)) : '—')}</td>
        ${planTypeCell}
        <td>${sheetTextCell('customer',c.id,'dob',c.dob,'date')}</td>
        <td>${sheetPillCell('customer',c.id,'nationality',c.nationality,NATIONALITIES, t('f.nationality'))}</td>
        <td>${sheetTextCell('customer',c.id,'years',c.years,'number')}</td>
        <td>${sheetTextCell('customer',c.id,'occupation',c.occupation,'text')}</td>
        <td>${sheetPillCell('customer',c.id,'handlerName',c.handlerName,STAFF_MEMBERS, t('f.handlerName'))}</td>
        <td>${sheetPillCell('service',svc.id,'simType',svc.simType,SIM_TYPES, t('f.simType'))}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="28">${emptyState()}</td></tr>`
  }</tbody>`;
  document.getElementById('sheetTable').querySelectorAll('[data-open-customer]').forEach(el=>{
    el.addEventListener('click', ()=> openCustomerDetail(el.getAttribute('data-open-customer')));
  });
  document.getElementById('sheetTable').querySelectorAll('[data-copy-name]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation(); // otherwise this click also bubbles up and opens the customer's detail page
      copyCustomerNameToClipboard(btn.getAttribute('data-copy-name'), btn);
    });
  });
  document.getElementById('sheetTable').querySelectorAll('[data-freeze-toggle]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      const custId = el.getAttribute('data-freeze-toggle');
      if(confirm(LANG==='zh'?`确定要为「${getCustomer(custId)?.name||''}」解除暂停吗？`:`Unfreeze this SIM for ${getCustomer(custId)?.name||'this customer'}?`)){
        unfreezeSim(custId, false);
        renderSheetPage();
      }
    });
  });
  if(scrollWrap && savedScrollLeft!==undefined){
    scrollWrap.scrollLeft = savedScrollLeft;
    scrollWrap.scrollTop = savedScrollTop;
    // the browser's own scroll-anchoring can override a same-tick assignment right after
    // this much DOM changed all at once — re-applying one frame later makes it stick
    requestAnimationFrame(()=>{ scrollWrap.scrollLeft = savedScrollLeft; scrollWrap.scrollTop = savedScrollTop; });
  }
}
/* Simple read-only table for Sheet View's Inactive / Duplicate tabs — these show WHY a
   customer has no active plan or which records look duplicated, not editable financial
   columns, so they don't fit the same shape as the Prepaid/Postpaid sheet. */
/* Prepaid plan-length tag for Sheet View — same rule as the profile (Recharge = a 30-day
   plan bought with the Recharge button or priced ₩36,000 / ₩36,300, except SAFARBAYEV BERIK),
   plus 15-day plans. Read-only: the editable length is the "Contract length (days)" column. */
function sheetPlanTagHtml(svc){
  if(!svc || svc.type!=='prepaid') return sheetReadonlyCell('—');
  const lab = planLengthLabel(svc);
  const d = Number(svc.durationDays);
  return lab ? `<span class="plan-tag ${lab[0]}" style="margin-left:0">${escapeHtml(lab[1])}</span>` : sheetReadonlyCell(d ? d+(LANG==='zh'?' 天':' days') : '—');
}
/* Under-19 view (Sheet View → Sort → "Under 19 only"): age and the date the customer turns 19 */
/* Unpaid balance = selling price − received, for every service except plans that were
   replaced (same rule as the dashboard's "Outstanding total", so the list adds up to it). */
function unpaidOf(s){ if(!s || (isSubscriptionType(s.type) && s.isActive===false)) return 0; return Math.max(0, (Number(s.sellingPrice)||0) - (Number(s.received)||0)); }
function customerUnpaid(c){ return customerServices(c.id).reduce((a,s)=>a+unpaidOf(s),0); }
function unpaidCell(amount){ return `<td><span class="pill pill-red">${fmtWon(amount)}</span></td>`; }
function isUnder19(c){ const a = calcAge(c && c.dob); return a!==null && a < 19; }
function turns19Date(dob){ return isIsoDate(dob) ? (Number(dob.slice(0,4))+19)+dob.slice(4,10) : ''; }
function u19Cell(c){
  const a = calcAge(c.dob), d = turns19Date(c.dob);
  if(a===null) return `<td>${sheetReadonlyCell('—')}</td>`;
  const days = d ? daysBetween(todayISO(), d) : null;
  const soon = days!==null && days <= 30;
  return `<td><span class="pill ${soon?'pill-orange':'pill-gray'}" title="${escapeHtml(d)}">${a} · ${LANG==='zh'?'满19岁 ':'19 on '}${escapeHtml(d)}${days!==null?` (${days}${LANG==='zh'?'天':'d'})`:''}</span></td>`;
}
const sheetExtraFilterVals = {prepaid:'', postpaid:''}; // remembered per tab
function renderSheetSimpleView(tab, dupeGroups, filters){
  const {natFilter, ratingFilter, recentFilter, search, dateFrom, dateTo, sortOrder} = filters;
  const u19 = sortOrder==='u19' && tab!=='dupes';
  const unpaid = sortOrder==='unpaid' && tab!=='dupes';
  const isDupeView = tab==='dupes';
  const isAllView = tab==='all';
  const groupIndexById = {};
  if(isDupeView) dupeGroups.forEach((g,i)=> g.forEach(c=> groupIndexById[c.id]=i));

  let list;
  if(isDupeView){
    list = dupeGroups.flat();
  } else if(isAllView){
    list = DB.customers; // every customer regardless of type or active/inactive status —
    // exists specifically so search isn't scoped to whichever tab happens to be open
  } else {
    list = DB.customers.filter(c=>!activeSubscriptionFor(c.id));
  }
  list = list.filter(c=>{
    if(natFilter && c.nationality!==natFilter) return false;
    if(ratingFilter && String(c.rating)!==ratingFilter) return false;
    // check the customer's most recent service activation date (whether or not it's still
    // active), not their overall record-creation date — same fix already applied to the
    // Prepaid/Postpaid tabs. A customer's record can be created long before a specific
    // service on it (e.g. converting from prepaid to postpaid today), so those two dates
    // genuinely differ and "Added: today" needs to mean "something happened today", not
    // "this customer record itself is new".
    if(dateFrom || dateTo || recentFilter){
      const svcs = customerServices(c.id);
      const mostRecentDate = svcs.length ? [...svcs].sort((a,b)=> new Date(b.activationDate||0)-new Date(a.activationDate||0))[0].activationDate : null;
      const relevantDate = mostRecentDate || customerJoinDate(c);
      if(dateFrom || dateTo){ if(!matchesDateRange(relevantDate, dateFrom, dateTo)) return false; }
      else if(!matchesRecentFilter(relevantDate, recentFilter)) return false;
    }
    if(search){
      const hay = [c.name,c.phone,c.nationality,c.idNumber].join(' ').toLowerCase();
      if(!hay.includes(search)) return false;
    }
    return true;
  });
  if(u19) list = list.filter(isUnder19).sort((a,b)=> String(a.dob).localeCompare(String(b.dob)));
  else if(unpaid) list = list.filter(c=>customerUnpaid(c)>0).sort((a,b)=> customerUnpaid(b)-customerUnpaid(a));
  else if(!isDupeView) list.sort((a,b)=> new Date(customerJoinDate(b)||0)-new Date(customerJoinDate(a)||0));

  document.getElementById('sheetCount').textContent = isDupeView
    ? `${dupeGroups.length} ${LANG==='zh'?'组重复 · 共':'duplicate groups · '} ${list.length} ${LANG==='zh'?'位客户 · 按姓名或电话匹配':'customers involved · matched by name or phone'}`
    : `${list.length} ${LANG==='zh'?'位客户':'customers'}${u19?(LANG==='zh'?' · 未满19岁':' under 19'):''}${unpaid?(LANG==='zh'?` · 未收款 ${fmtWon(list.reduce((a,c)=>a+customerUnpaid(c),0))}`:` with unpaid balance · ${fmtWon(list.reduce((a,c)=>a+customerUnpaid(c),0))}`):''}`;

  const head = `<th>${t('col.customer')}</th>${u19?`<th>${t('col.u19')}</th>`:unpaid?`<th>${t('col.outstanding')}</th>`:''}<th>${t('f.phone')}</th><th>${t('f.nationality')}</th><th>${t('f.idType')}</th>
    <th>${isDupeView ? t('col.dupeReason') : (isAllView ? t('col.status') : t('col.contractStatus'))}</th><th>${t('col.recentActivity')}</th><th>${t('col.dateAdded')}</th><th>${t('col.rating')}</th><th></th>`;
  const rowsHtml = list.length ? list.map(c=>{
    const svcs = customerServices(c.id);
    const active = activeSubscriptionFor(c.id);
    const recent = [...svcs].sort((a,b)=> new Date(b.activationDate||0)-new Date(a.activationDate||0))[0];
    const groupBand = isDupeView ? (groupIndexById[c.id]%2===0 ? 'dupe-band-a' : 'dupe-band-b') : '';
    let statusCell;
    if(isDupeView){
      const group = dupeGroups[groupIndexById[c.id]];
      const isNewestInGroup = group[0].id === c.id;
      const sameName = group.filter(x=>x.id!==c.id).some(x=>x.name.trim().toLowerCase()===c.name.trim().toLowerCase());
      const samePhone = c.phone && group.filter(x=>x.id!==c.id).some(x=>x.phone===c.phone);
      const reasons = [sameName?t('dupe.reasonName'):null, samePhone?t('dupe.reasonPhone'):null].filter(Boolean).join(' + ');
      statusCell = `<td><span class="pill pill-red">${reasons||t('dupe.reasonName')}</span></td>`;
      var mergeBtn = isNewestInGroup ? `<button class="btn btn-sm btn-primary" data-merge-group="${groupIndexById[c.id]}" title="${LANG==='zh'?'将本组其他重复客户合并到这条最新记录中':'Merge the other duplicates in this group into this newest record'}">🔀 ${t('btn.merge')}</button> ` : '';
    } else if(isAllView){
      statusCell = active
        ? `<td><span class="pill ${active.type==='prepaid'?'pill-orange':'pill-blue'}">${t('opt.'+active.type+'Short')}</span></td>`
        : `<td><span class="pill pill-gray">${t('custtab.inactive')}</span></td>`;
      var mergeBtn = '';
    } else {
      const reasonTxt = recent && recent.changeReason==='cancelled' ? t('reason.cancelled') : (LANG==='zh'?'未续约':'Not renewed');
      const endedOn = recent && (recent.endedAt || recent.expiryDate);
      const daysAgo = endedOn ? daysBetween(endedOn, todayISO()) : null;
      statusCell = `<td><span style="color:var(--red);font-weight:700;font-size:12px;">${recent ? reasonTxt+(daysAgo!==null && daysAgo>=0 ? (LANG==='zh'?` · ${daysAgo}天前`:` · ${daysAgo}d ago`) : '') : '—'}</span></td>`;
      var mergeBtn = '';
    }
    return `<tr class="row-click ${groupBand}" data-open-customer="${c.id}">
      <td class="name-cell" title="${escapeHtml(c.name)}"><span class="avatar">${initials(c.name)}</span><span class="name-text">${escapeHtml(c.name)}</span><button class="copy-name-btn" data-copy-name="${c.id}" title="${t('btn.copyName')}">📋</button></td>${u19 ? u19Cell(c) : unpaid ? unpaidCell(customerUnpaid(c)) : ''}
      <td>${escapeHtml(c.phone||'—')}</td>
      <td><span class="cell-ellipsis">${escapeHtml(c.nationality)}</span></td>
      <td>${c.idType?t('idtype.'+c.idType):'—'}</td>
      ${statusCell}
      <td>${recent? t('type.'+recent.type) : '—'}</td>
      <td class="nowrap">${fmtDate(customerJoinDate(c))}</td>
      <td>${'★'.repeat(c.rating||0)}<span style="color:#DADEEA">${'★'.repeat(5-(c.rating||0))}</span></td>
      <td style="white-space:nowrap;">${mergeBtn}<button class="btn btn-sm btn-ghost" data-open-customer="${c.id}">${t('btn.view')}</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="9">${isDupeView ? emptyStateDupes() : emptyState()}</td></tr>`;

  document.getElementById('sheetTable').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${rowsHtml}</tbody>`;
  document.getElementById('sheetTable').querySelectorAll('[data-open-customer]').forEach(el=>{
    el.addEventListener('click', ()=> openCustomerDetail(el.getAttribute('data-open-customer')));
  });
  document.getElementById('sheetTable').querySelectorAll('[data-copy-name]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      copyCustomerNameToClipboard(btn.getAttribute('data-copy-name'), btn);
    });
  });
  document.getElementById('sheetTable').querySelectorAll('[data-merge-group]').forEach(el=>{
    el.addEventListener('click', (e)=>{ e.stopPropagation(); mergeDuplicateGroup(dupeGroups[Number(el.dataset.mergeGroup)].map(c=>c.id)); renderSheetPage(); });
  });
}

const REFERRALS_KEY = ['friend','school','online','walk_in','agent','other'];
const REFERRALS_LABEL = {zh:{friend:'朋友介绍',school:'学校',online:'线上广告',walk_in:'路过进店',agent:'中介合作',other:'其他'},en:{friend:'Friend referral',school:'School',online:'Online ad',walk_in:'Walk-in',agent:'Agent partner',other:'Other'}};
const SERVICE_TYPES = ['prepaid','postpaid','porting','transfer','topup','cancel'];
const STATUSES = ['active','payment_pending','docs_pending','expiring_soon','expired','cancelled','superseded'];
const PAY_METHODS = ['cash','transfer','card','kakaopay','other'];
/* 프리티텔레콤 (Preeti Telecom) 업무구분 — plan/registration type shown in the "New customer" form */
const PLAN_TYPES = [['신규가입','plantype.new'],['번호이동','plantype.mnp'],['명의변경','plantype.transfer'],['기간연장','plantype.extend'],['선불전환','plantype.convert']];
/* fixed values used when auto-printing the Preeti Telecom prepaid application form */
const PREETI_FIXED_ADDRESS = '대전시 동구 동대전로 171';
const PREETI_FIXED_PLAN = '3개월 충전';
const PREETI_FIELD_FONT_SIZE = 10;
const CHANGE_REASONS = ['new','upgraded_to_postpaid','plan_change','cancelled','switched_carrier','expired_natural','other'];

function uid(prefix){ return prefix+'_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4); }
/* Local calendar date (the store's own clock), NOT UTC. toISOString() is UTC, which in
   Korea (UTC+9) still reads as yesterday until 9 am — that made early-morning signups get
   yesterday's activation date and shifted "due today" by a day. */
function pad2(n){ return String(n).padStart(2,'0'); }
function localISO(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function todayISO(){ return localISO(new Date()); }
/* "YYYY-MM" for the month that is `offset` months from the current local month. Built from
   local year/month parts — new Date(y,m,1).toISOString() lands on the previous day in UTC
   for Korea, which silently shifted every month bucket back by one. */
function localMonthKey(offset){ const n=new Date(); const d=new Date(n.getFullYear(), n.getMonth()+(offset||0), 1); return d.getFullYear()+'-'+pad2(d.getMonth()+1); }
/* Adds whole days to an ISO date string using UTC arithmetic on both ends, so the result
   never depends on the computer's time zone. */
function addDaysISO(iso, days){ const d = new Date(String(iso).slice(0,10)+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+Number(days||0)); return d.toISOString().slice(0,10); }
function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }
/* "This month" means the current calendar month specifically (e.g. all of August), not a
   rolling 30-day window — those are genuinely different things: on August 27th, "last 30
   days" reaches back into late July, which isn't what "this month" means to someone
   reading it. The other options (today/7 days/30 days) stay as rolling windows, since
   those are correctly understood as rolling. */
function matchesRecentFilter(dateStr, recentFilter){
  if(!recentFilter) return true;
  if(!dateStr) return false;
  if(recentFilter==='thisMonth') return dateStr.slice(0,7)===todayISO().slice(0,7);
  return daysBetween(dateStr, todayISO())<=Number(recentFilter);
}
/* Custom activation-date range filter — a separate, more precise alternative to the preset
   "Added: today/7 days/etc." dropdown above. When either end of the range is set, it takes
   over from the preset entirely (rather than both applying together, which could silently
   over-restrict results if someone forgot a preset was still selected — the exact kind of
   confusion that's come up here before). Either end can be left blank for an open range. */
function matchesDateRange(dateStr, dateFrom, dateTo){
  if(!dateFrom && !dateTo) return true;
  if(!dateStr) return false;
  if(dateFrom && dateStr<dateFrom) return false;
  if(dateTo && dateStr>dateTo) return false;
  return true;
}
/* Whole calendar months elapsed since a date, used for "customer has passed 6/8/12 months" filters. */
function monthsSince(dateStr){
  if(!dateStr || !isIsoDate(dateStr)) return null;
  const d = new Date(dateStr), now = new Date();
  let months = (now.getFullYear()-d.getFullYear())*12 + (now.getMonth()-d.getMonth());
  if(now.getDate() < d.getDate()) months--;
  return Math.max(0, months);
}
function fmtDate(d){ if(!d) return '—'; if(!isIsoDate(d)) return '—'; return d.slice(0,10); }
/* Raw ISO dates ("2026-06-03") are fine in dense tables where quick scanning/sorting
   matters, but on the customer profile — where someone is actually reading, not scanning
   a spreadsheet — "Jun 3, 2026" is faster to actually parse at a glance. Kept as a
   separate function rather than changing fmtDate everywhere, since Sheet View and other
   dense table contexts are better served by the compact ISO form. */
function fmtDateHuman(d){
  if(!d || !isIsoDate(d)) return '—';
  const dt = new Date(d+'T00:00:00');
  if(isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(LANG==='zh'?'zh-CN':'en-US', {year:'numeric', month:'short', day:'numeric'});
}
function fmtWon(n){ n = Math.round(Number(n)||0); return '₩'+n.toLocaleString('en-US'); }
function calcAge(dob){ if(!dob || !isIsoDate(dob)) return null; const d=new Date(dob); if(isNaN(d.getTime())) return null; const now=new Date(); let age = now.getFullYear()-d.getFullYear(); const m = now.getMonth()-d.getMonth(); if(m<0 || (m===0 && now.getDate()<d.getDate())) age--; return age; }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function isIsoDate(s){ return typeof s==='string' && /^\d{4}-\d{2}-\d{2}/.test(s); }
/* Real-world spreadsheets store dates in all kinds of formats — Excel serials, "2026/2/23",
   "2026年5月24日 星期日", etc. Parse whatever we're given into a clean ISO YYYY-MM-DD string,
   or '' if it truly can't be understood, rather than storing garbage that breaks date math later. */
function parseFlexibleDate(v){
  if(v===null || v===undefined || v==='') return '';
  if(v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0,10);
  if(typeof v === 'number' && isFinite(v)){
    // Excel serial date (days since 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
  }
  let s = String(v).trim();
  if(!s) return '';
  // strip trailing weekday text like "星期日" / "(星期日)" / "Sunday"
  s = s.replace(/[\(（]?星期[一二三四五六日天][\)）]?/g,'').trim();
  s = s.replace(/\b(sun|mon|tue|wed|thu|fri|sat)(day)?\b/gi,'').trim();
  let m = s.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?/);
  if(m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if(m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if(m){
    // Ambiguous D/M/Y vs M/D/Y formats — this app is used in Korea, where dates are
    // written day-first (or as YYYY-MM-DD), never in the US month-first style, so that's
    // the default assumption here. But if one of the two numbers is over 12, it can only
    // be a day regardless of position, so that case is resolved unambiguously either way —
    // "05/03/2026" defaults to 5th of March, while something like "15/03/2026" or
    // "03/15/2026" is read correctly regardless of which position the 15 is in.
    let day = Number(m[1]), month = Number(m[2]);
    if(month > 12 && day <= 12){ [day, month] = [month, day]; } // e.g. "03/15/2026" (US-style) — 15 can only be the day
    return `${m[3]}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  const d = new Date(s);
  if(!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return '';
}
/* Korean-style 6-digit birth date (YYMMDD), e.g. "040728" -> 2004-07-28.
   Falls back to parseFlexibleDate for anything that isn't exactly 6 digits. */
function parseDobFlexible(v){
  const s = String(v==null?'':v).trim();
  if(/^\d{6}$/.test(s)){
    const yy = Number(s.slice(0,2));
    const curYY = Number(String(new Date().getFullYear()).slice(2));
    const century = yy <= curYY+5 ? '20' : '19';
    return `${century}${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
  }
  return parseFlexibleDate(v);
}
/* ID expiry typed like the birth date: 6 digits YYMMDD, always 20YY (an ID expiry is never
   in the 1900s) — "290101" → 2029-01-01. Anything else falls back to parseFlexibleDate, so
   "2029-01-01" or "2029/1/1" still work. */
function parseExpiryFlexible(v){
  const s = String(v==null?'':v).trim();
  if(/^\d{6}$/.test(s)){
    const iso = `20${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;
    const d = new Date(iso+'T00:00:00Z');
    return (!isNaN(d.getTime()) && d.toISOString().slice(0,10)===iso) ? iso : '';
  }
  return parseFlexibleDate(v);
}
function initials(name){ if(!name) return '?'; const p=name.trim().split(/\s+/); return (p[0][0]+(p[1]?p[1][0]:'')).toUpperCase(); }

/* One-time (per-load, cheap) repair pass: fixes any dates that were stored in a non-ISO
   format by an earlier version of the importer (e.g. "2026年5月24日 星期日"), which otherwise
   silently break date math (NaN days-left) and date-badge rendering. Only touches fields that
   aren't already valid ISO dates, and only saves if something actually changed. */
function repairInvalidDates(db){
  let changed = false;
  (db.customers||[]).forEach(c=>{
    if(c.dob && !isIsoDate(c.dob)){ const fixed = parseDobFlexible(c.dob); if(fixed!==c.dob){ c.dob = fixed; changed = true; } }
    if(c.idExpiry && !isIsoDate(c.idExpiry)){ const fixed = parseFlexibleDate(c.idExpiry); if(fixed!==c.idExpiry){ c.idExpiry = fixed; changed = true; } }
  });
  (db.services||[]).forEach(s=>{
    if(s.activationDate && !isIsoDate(s.activationDate)){ const fixed = parseFlexibleDate(s.activationDate) || todayISO(); if(fixed!==s.activationDate){ s.activationDate = fixed; changed = true; } }
    if(s.expiryDate && !isIsoDate(s.expiryDate)){ const fixed = parseFlexibleDate(s.expiryDate); if(fixed!==s.expiryDate){ s.expiryDate = fixed; changed = true; } }
  });
  if(changed) saveDB(db);
}
/* Corrects createdAt values that were wrongly stamped with a push date instead of being
   left blank — this happened for any customer whose earliest known activity (a service's
   activation date) is BEFORE their stored createdAt, which is only possible if createdAt
   was set incorrectly (a customer can't have a service before becoming a customer). Nulling
   it out lets customerJoinDate() correctly fall back to that earlier, real date instead. */
function repairJoinDates(db){
  let changed = false;
  (db.customers||[]).forEach(c=>{
    if(!c.createdAt) return;
    const svcs = (db.services||[]).filter(s=>s.customerId===c.id).map(s=>s.activationDate).filter(isIsoDate).sort();
    if(svcs.length && svcs[0] < String(c.createdAt).slice(0,10)){
      c.createdAt = null;
      changed = true;
    }
  });
  if(changed) saveDB(db);
}
/* Fills in a missing expiry date for any service that has both an activation date and a
   duration but no expiry — this is exactly what happened to a large batch of imported
   customers whose spreadsheet had no explicitly-labeled "expiry date" column that the
   importer could recognize. Every "days remaining / expired / over contract" calculation in
   the app depends on expiryDate, so this one gap was silently breaking that everywhere for
   those customers until fixed here. */
function repairMissingExpiryDates(db){
  let changed = false;
  (db.services||[]).forEach(s=>{
    if(!s.expiryDate && s.activationDate && isIsoDate(s.activationDate) && s.durationDays){
      const d = new Date(s.activationDate); d.setDate(d.getDate()+Number(s.durationDays));
      s.expiryDate = d.toISOString().slice(0,10);
      changed = true;
    }
  });
  if(changed) saveDB(db);
}
/* One-time repair for prepaid services whose Expiry Date doesn't actually match Activation
   Date + Duration — e.g. a customer showing "30 days" but an expiry date 3 months out.
   Root cause: the general Excel importer used to trust the sheet's own "Expiry Date" column
   whenever present, even when it disagreed with the sheet's Contract Days column (a very
   common spreadsheet mistake — that cell left stale from an older plan or template). The
   importer itself is now fixed to always compute from activation+duration, but customers
   already imported before that fix still carry the bad expiry date, so this repairs them
   retroactively. Frozen services are skipped — a freeze legitimately pushes expiryDate
   beyond activation+duration on purpose, so a "mismatch" there isn't a bug. */
function repairMismatchedPrepaidExpiry(db){
  let changed = 0;
  (db.services||[]).forEach(s=>{
    if(s.type!=='prepaid') return;
    if(!s.activationDate || !isIsoDate(s.activationDate) || !s.durationDays || !s.expiryDate) return;
    if(s.freezes && s.freezes.length) return; // freezes legitimately shift expiry, don't touch
    const d = new Date(s.activationDate); d.setDate(d.getDate()+Number(s.durationDays));
    const correct = d.toISOString().slice(0,10);
    if(s.expiryDate !== correct){
      s.expiryDate = correct;
      changed++;
    }
  });
  if(changed) saveDB(db);
  return changed;
}

/* Partner company names were shortened on 2026-11-10: "LG本社" → "LG", "SK本社" → "SK".
   Renames only that one field on records still using an old name (also catches imports of
   older Excel files). Nothing else on the record changes and nothing is deleted. */
const PARTNER_RENAMES = {'LG本社':'LG', 'SK本社':'SK'};
function renamePartnerCompanies(db){
  let changed = false;
  (db.services||[]).forEach(s=>{
    const v = s.partnerCompany==null ? '' : String(s.partnerCompany).trim();
    if(PARTNER_RENAMES[v]){ s.partnerCompany = PARTNER_RENAMES[v]; changed = true; }
  });
  if(changed) saveDB(db);
}
function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(raw){
      const db = JSON.parse(raw);
      if(!db.templates) db.templates = [];
      if(!db.reminderState) db.reminderState = {};
      ensurePreetiTemplate(db);
      migrateIdChangeTemplatePairs(db);
      repairInvalidDates(db);
      repairActiveSubscriptions(db);
      repairJoinDates(db);
      repairMissingExpiryDates(db);
      renamePartnerCompanies(db);
      // repairMismatchedPrepaidExpiry() used to run here on every load and silently force
      // expiry = activation + contract days. When the stored contract days were the wrong
      // ones (e.g. an import that read a "days used" column as the plan length), it cut real
      // 3-month plans down to 1 month, and it also undid any expiry date staff corrected by
      // hand. Mismatches are now only REPORTED in Import / Export → Data check, never changed
      // automatically.
      return db;
    }
  }catch(e){}
  // Fresh install: start completely empty — no demo customers. The only default is the
  // built-in Preeti print template itself, which isn't customer data, just a form to print on.
  const empty = {customers:[], services:[], templates:[], reminderState:{}, meta:{createdAt:Date.now()}};
  ensurePreetiTemplate(empty);
  saveDB(empty);
  return empty;
}
function saveDB(db){
  saveDBToLocalStorage(db);
  scheduleServerSync();
}
/* localStorage has a hard size cap per browser (commonly 5-10MB) — a real customer base of
   hundreds of records plus print templates (which embed real scanned images as base64 data,
   often the single largest contributor) can exceed it. Without this safety net, a quota
   error here would throw and block whatever action triggered the save — including, as
   happened, the unlock flow itself. Falls back to caching without templates (the biggest
   and least time-critical piece — they're always available again on the next server pull)
   rather than losing the ability to work locally at all. */
function saveDBToLocalStorage(db){
  try{
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }catch(err){
    console.warn('Local cache write failed (likely storage quota), retrying without print templates:', err.message);
    try{
      localStorage.setItem(DB_KEY, JSON.stringify({...db, templates:[]}));
    }catch(err2){
      console.warn('Local cache write still failed even without templates — continuing with in-memory data only for this session:', err2.message);
    }
  }
}
// DB starts as a harmless empty placeholder — NOT loaded from localStorage yet. This is
// intentional: real (or previously-cached) customer data must never sit in memory before
// the lock screen is passed, even briefly. The real load happens explicitly, only after
// someone unlocks with the server + password, or deliberately chooses to skip and work
// with a blank local session (see the lock screen wiring near the bottom of this file).
let DB = {customers:[], services:[], templates:[], reminderState:{}, meta:{createdAt:Date.now()}};

/* ============================================================
   OPTIONAL SERVER SYNC — off by default. When configured, this keeps a shared PostgreSQL
   database (via the local API server) in sync with this browser's data, so multiple store
   computers can share one dataset. When NOT configured, the app behaves exactly as it always
   has: localStorage only. loadDB()/saveDB() above are untouched in their local behavior —
   this layer only ever ADDS a background push/pull on top, and always fails silently
   (falling back to local data) if the server is unreachable, so a store computer that's
   offline or a laptop away from the store keeps working normally.
   ============================================================ */
// No default and off by default — a fresh browser that's never had the server address
// entered shows nothing but local/demo data. Sync only starts once someone deliberately
// types in the server address and enables it; that choice is then remembered per-browser.
function getServerUrl(){ return (localStorage.getItem(SERVER_URL_KEY)||'').replace(/\/$/,''); }
function setServerUrl(url){ localStorage.setItem(SERVER_URL_KEY, (url||'').replace(/\/$/,'')); }
function isSyncEnabled(){ return localStorage.getItem(SYNC_ENABLED_KEY)==='1' && !!getServerUrl(); }
function setSyncEnabled(on){ localStorage.setItem(SYNC_ENABLED_KEY, on?'1':'0'); }
function getLastSync(){ return localStorage.getItem(LAST_SYNC_KEY) || ''; }
function getApiKey(){ return localStorage.getItem(API_KEY_STORAGE_KEY) || ''; }
function setApiKey(key){ localStorage.setItem(API_KEY_STORAGE_KEY, key||''); }
// every request to the server includes this header — the server rejects anything without
// the matching key, so only devices that have been deliberately given this key can read or
// change customer data, even if someone else is on the same store WiFi
function authHeaders(extra){ return Object.assign({'X-API-Key': getApiKey()}, extra||{}); }

async function testServerConnection(url){
  const base = (url||'').replace(/\/$/,'');
  if(!base) return {ok:false, error: LANG==='zh'?'请先输入服务器地址':'Please enter a server address'};
  try{
    const res = await fetch(base+'/api/health', {method:'GET'});
    if(!res.ok) return {ok:false, error:`HTTP ${res.status}`};
    const data = await res.json();
    return {ok: !!data.ok};
  }catch(err){
    return {ok:false, error: err.message || String(err)};
  }
}

// Pushes the current in-memory dataset to the server. Debounced so rapid consecutive saves
// (e.g. typing in Sheet View) batch into one request instead of one per keystroke.
// Blocks any automatic push while the app is loading and about to reconcile with the server
// for the first time this session. Without this, a repair function firing during loadDB()
// (using the LOCAL, possibly stale cache) could push that stale data to the server before
// the corrective initial pull ever gets a chance to run — this is exactly what silently
// undid a "Format Data" wipe from another computer once: the wiped computer's server state
// was correct for a moment, then a second computer's stale local cache got auto-repaired,
// auto-pushed, and the old data came right back.
let suppressAutoPush = false;
function scheduleServerSync(){
  if(!isSyncEnabled() || suppressAutoPush) return;
  clearTimeout(syncTimer);
  // marks a push as "owed" the moment something changes, not just while the request is
  // actually in flight — see hasPendingOrInFlightPush()'s comment for why this matters
  pushPending = true;
  // 400ms — short enough that changes reach the server almost immediately, while still
  // batching truly rapid-fire edits (e.g. typing in Sheet View) into one request instead
  // of one per keystroke. Previously 1000ms, which was part of why sync felt sluggish.
  syncTimer = setTimeout(pushToServer, 400);
}
/* Whether a push is scheduled-but-not-yet-sent, OR actually in flight right now. The
   background poll (every 15s) checks this before pulling — a pull fully replaces
   DB.customers/DB.services with whatever the server currently has, so if it runs while a
   recent local edit hasn't reached the server yet, that edit gets silently overwritten by
   the server's still-stale copy of the data. This is exactly what was happening: someone
   would edit one cell (scheduling a push 400ms later), immediately edit a second cell, and
   if the 15s poll happened to land in that narrow window, the first edit would vanish —
   revealed only when the second cell's own re-render displayed the now-reverted data. */
function hasPendingOrInFlightPush(){ return pushPending || pushInFlight; }
// Persistent "not connected" banner — only shown when sync is actually turned ON but a
// recent attempt failed (an unexpected disconnection), never for someone who deliberately
// chose to work locally (Skip / sync off), since that's an intentional, not broken, state.
function setOfflineBanner(show, errorMsg){
  const el = document.getElementById('offlineBanner');
  if(!el) return;
  if(show && isSyncEnabled()){
    document.getElementById('offlineBannerText').textContent = LANG==='zh'
      ? `未连接到服务器，更改仅保存在本机，其他电脑暂时看不到${errorMsg?'（'+errorMsg+'）':''}`
      : `Not connected to the server — changes are only saving on this computer, other computers won't see them yet${errorMsg?' ('+errorMsg+')':''}`;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}
// Checks the server's own schema self-check (added after a real outage where the database
// was missing columns the server code expected — every sync silently failed for as long as
// nobody happened to check the database directly in psql). Surfaced right in the app instead
// of a server console log nobody's watching, since the server runs headless in the background.
async function checkServerSchema(){
  const base = getServerUrl();
  if(!base) return;
  try{
    const res = await fetch(base+'/api/health', {method:'GET'});
    const data = await res.json();
    const el = document.getElementById('offlineBanner');
    if(data.schemaOk === false){
      document.getElementById('offlineBannerText').textContent = LANG==='zh'
        ? `⚠️ 服务器数据库需要更新（缺少字段：${data.missingColumns.join(', ')}）— 请在服务器电脑上重新运行 schema.sql，部分功能可能无法正常保存`
        : `⚠️ Server database needs an update (missing: ${data.missingColumns.join(', ')}) — re-run schema.sql on the server computer, some data may not save correctly until then`;
      el.style.display = '';
    }
    // if schema IS ok, deliberately don't touch the banner here — it may already correctly
    // be showing/hiding based on connection status from the pull that triggered this check
  }catch(err){
    // silent — this is a supplementary check; a failure here shouldn't itself alarm anyone,
    // the regular connection check already covers "can't reach the server at all"
  }
}
/* ---------- change-only sync ----------
   syncBaseline remembers, per record id, exactly what the SERVER holds (as of the last pull
   or successful push, this session only). A push sends only records that differ from it.
   Why: pushing the whole database meant a computer that hadn't pulled for a few seconds
   re-uploaded its OLD copy of every customer — overwriting another computer's newer edits
   and bringing back customers that had just been deleted. /api/sync only upserts (it never
   deletes anything missing from a push), so sending fewer records is always safe. */
let syncBaseline = null; // {customers, services, templates, reminders: Map<id,json>} — null = not reconciled yet
// templates/reminders parts may be null (not known yet) → those are then sent whole, as before
function recordMap(list){ const m = new Map(); (list||[]).forEach(r=>{ if(r && r.id) m.set(r.id, JSON.stringify(r)); }); return m; }
function setSyncBaselineFrom(customers, services){
  const prev = syncBaseline || {};
  syncBaseline = {customers: recordMap(customers), services: recordMap(services), templates: prev.templates||null, reminders: prev.reminders||null};
}
/* Server's "templates version" code from the last full download (needs the updated
   snapshot.js; stays null with an older server, which keeps the old full-download behaviour). */
let templatesVersionSeen = null;
function changedRecords(list, baseMap){ return baseMap ? (list||[]).filter(r=> r && r.id && baseMap.get(r.id)!==JSON.stringify(r)) : (list||[]).slice(); }
/* Server copy wins EXCEPT for records changed on this computer since the last sync — those
   are kept (and pushed next). Records deleted on another computer (on the server baseline,
   untouched here, gone from the server) correctly disappear. */
function mergeServerWithLocalEdits(localList, serverList, baseMap){
  const dirty = new Map();
  (localList||[]).forEach(r=>{ if(r && r.id && baseMap.get(r.id)!==JSON.stringify(r)) dirty.set(r.id, r); });
  const out = (serverList||[]).map(r=> dirty.has(r.id) ? dirty.get(r.id) : r);
  const onServer = new Set((serverList||[]).map(r=>r.id));
  dirty.forEach((r,id)=>{ if(!onServer.has(id)) out.push(r); });
  return {list: out, kept: dirty.size};
}
/* Customers deleted here whose server delete hasn't been confirmed yet (offline, server
   off). Kept in this browser and retried, and filtered out of every pull meanwhile — so a
   deleted customer no longer reappears after the next pull. */
const PENDING_DELETES_KEY = 'himobile_pending_deletes';
function getPendingDeletes(){ try{ const a = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function setPendingDeletes(a){ try{ if(a.length) localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(a)); else localStorage.removeItem(PENDING_DELETES_KEY); }catch(e){} }
async function retryPendingDeletes(){
  const ids = getPendingDeletes();
  for(const id of ids){ await deleteCustomerOnServer(id); }
}
async function pushToServer(opts){
  const base = getServerUrl();
  if(!base){ pushPending = false; return {ok:false, error:'no server configured'}; }
  pushPending = false; // no longer just "scheduled" — the request is starting now
  pushInFlight = true;
  try{
    const full = !!(opts && opts.full) || !syncBaseline;
    const custs = full ? DB.customers.slice() : changedRecords(DB.customers, syncBaseline.customers);
    const svcs = full ? DB.services.slice() : changedRecords(DB.services, syncBaseline.services);
    // exactly what is being sent, captured now — the record may change again while in flight
    const sentC = custs.map(r=>[r.id, JSON.stringify(r)]);
    const sentS = svcs.map(r=>[r.id, JSON.stringify(r)]);
    // Print templates hold scanned images (~400 KB for the Preeti form alone) — they used to
    // be re-uploaded with EVERY save. routes/sync.js upserts each template on its own and
    // ignores ones not sent, so only new/edited templates are sent now. Same for reminder
    // statuses (each key is its own row on the server).
    const tplBase = (!full && syncBaseline && syncBaseline.templates) || null;
    const tpls = tplBase ? changedRecords(DB.templates, tplBase) : (DB.templates||[]).slice();
    const sentT = tpls.map(r=>[r.id, JSON.stringify(r)]);
    const remBase = (!full && syncBaseline && syncBaseline.reminders) || null;
    const rems = {};
    Object.entries(DB.reminderState||{}).forEach(([k,v])=>{ if(!remBase || remBase.get(k)!==v) rems[k] = v; });
    const res = await fetch(base+'/api/sync', {
      method:'POST',
      headers: authHeaders({'Content-Type':'application/json'}),
      body: JSON.stringify({customers: custs, services: svcs, templates: tpls, reminderState: rems}),
    });
    if(res.status===401) throw new Error(LANG==='zh'?'密钥不正确，请检查服务器同步设置':'Incorrect API key — check server sync settings');
    if(!res.ok) throw new Error('HTTP '+res.status);
    const result = await res.json();
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    updateSyncStatusUI();
    setOfflineBanner(false);
    // the server processes each record independently now, so most records can succeed even
    // if a few specific ones fail — log it for debugging, but don't toast here since this
    // function also runs silently in the background after every save; the explicit "Push
    // now" button handler surfaces this to the user itself
    const failedCount = (result.failedCustomers?.length||0) + (result.failedServices?.length||0);
    if(failedCount > 0) console.warn('Some records failed to sync:', result.failedCustomers, result.failedServices);
    // the server now holds what was sent — except records it reported as failed, which stay
    // "changed" so they're retried on the next push
    const failedIds = new Set([...(result.failedCustomers||[]), ...(result.failedServices||[])].map(f=> (f && typeof f==='object') ? (f.id||f.customerId||'') : f));
    const failedTplIds = new Set((result.failedTemplates||[]).map(f=> (f && typeof f==='object') ? f.id : f));
    if(!syncBaseline) syncBaseline = {customers:new Map(), services:new Map(), templates:null, reminders:null};
    if(!syncBaseline.templates) syncBaseline.templates = new Map();
    if(!syncBaseline.reminders) syncBaseline.reminders = new Map();
    sentC.forEach(([id,json])=>{ if(!failedIds.has(id)) syncBaseline.customers.set(id, json); });
    sentS.forEach(([id,json])=>{ if(!failedIds.has(id)) syncBaseline.services.set(id, json); });
    sentT.forEach(([id,json])=>{ if(!failedTplIds.has(id)) syncBaseline.templates.set(id, json); });
    Object.entries(rems).forEach(([k,v])=> syncBaseline.reminders.set(k, v));
    if(sentT.length) templatesVersionSeen = null; // our own change → next background check fetches templates once
    return {ok:true, failedCustomers: result.failedCustomers, failedServices: result.failedServices, sentCustomers: sentC.length, sentServices: sentS.length};
  }catch(err){
    // silent by design: a store computer that's briefly offline, or the server not running
    // yet, should never interrupt someone mid-task — local data keeps working regardless
    console.warn('Server sync failed, continuing with local data only:', err.message);
    updateSyncStatusUI(err.message);
    setOfflineBanner(true, err.message);
    return {ok:false, error: err.message};
  }finally{
    pushInFlight = false;
  }
}
// Pulls the server's current dataset and replaces the in-memory DB with it — used once at
// boot (if sync is on) so this computer starts from whatever the other computers last saved,
// and available as a manual "Pull latest" action too.
async function pullFromServer(opts){
  const base = getServerUrl();
  if(!base) return {ok:false, error:'no server configured'};
  // "light" = the 15-second background check: asks for the templates' version code instead
  // of the template images themselves. Only used once a version code has been seen (i.e.
  // the server has the updated snapshot.js); otherwise it's a normal full download.
  const light = !!(opts && opts.light) && templatesVersionSeen!==null;
  try{
    // Without an explicit timeout, an unreachable server (wrong network, server PC off,
    // firewall) leaves fetch() hanging for a very long time with zero feedback — the
    // unlock button just sits there disabled and nothing visibly happens. 10 seconds is
    // long enough for a slow local network, short enough that a genuinely unreachable
    // server surfaces a clear error instead of looking like the app has frozen.
    const controller = new AbortController();
    const timeoutId = setTimeout(()=> controller.abort(), 10000);
    let res;
    try{
      res = await fetch(base+'/api/snapshot'+(light?'?templates=version':''), {method:'GET', headers: authHeaders(), signal: controller.signal});
    } finally {
      clearTimeout(timeoutId);
    }
    if(res.status===401) throw new Error(LANG==='zh'?'密钥不正确，请检查服务器同步设置':'Incorrect API key — check server sync settings');
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const gotTemplates = Array.isArray(data.templates);
    // templates changed on the server since we last downloaded them → get everything once
    if(light && !gotTemplates && data.templatesVersion && data.templatesVersion!==templatesVersionSeen) return pullFromServer();
    if(data.templatesVersion && gotTemplates) templatesVersionSeen = data.templatesVersion;
    const serverCustomers = data.customers || [];
    const serverServices = data.services || [];
    let keptLocalEdits = 0;
    if(syncBaseline){
      // already reconciled this session → don't let the pull wipe edits made here that
      // haven't reached the server yet (e.g. typed while this request was in flight)
      const mc = mergeServerWithLocalEdits(DB.customers, serverCustomers, syncBaseline.customers);
      const ms = mergeServerWithLocalEdits(DB.services, serverServices, syncBaseline.services);
      DB.customers = mc.list; DB.services = ms.list; keptLocalEdits = mc.kept + ms.kept;
    } else {
      // first pull of the session: the server is the truth (local cache may be stale)
      DB.customers = serverCustomers;
      DB.services = serverServices;
    }
    setSyncBaselineFrom(serverCustomers, serverServices);
    const pendingDel = new Set(getPendingDeletes());
    if(pendingDel.size){
      DB.customers = DB.customers.filter(c=>!pendingDel.has(c.id));
      DB.services = DB.services.filter(s=>!pendingDel.has(s.customerId));
      retryPendingDeletes();
    }
    if(gotTemplates){
      const prevTplBase = syncBaseline && syncBaseline.templates;
      if(data.templates.length){
        // keep templates edited here that haven't reached the server yet
        DB.templates = prevTplBase ? mergeServerWithLocalEdits(DB.templates, data.templates, prevTplBase).list : data.templates;
      }
      syncBaseline.templates = recordMap(data.templates);
    } // (light check with unchanged version: local templates are already current — keep them)
    if(data.reminderState){
      const prevRem = syncBaseline && syncBaseline.reminders;
      if(prevRem){
        const merged = {...data.reminderState};
        Object.entries(DB.reminderState||{}).forEach(([k,v])=>{ if(prevRem.get(k)!==v) merged[k] = v; }); // local, not yet pushed
        DB.reminderState = merged;
      } else {
        DB.reminderState = data.reminderState;
      }
      syncBaseline.reminders = new Map(Object.entries(data.reminderState));
    }
    ensurePreetiTemplate(DB);
    migrateIdChangeTemplatePairs(DB);
    repairInvalidDates(DB);
    repairActiveSubscriptions(DB);
    repairJoinDates(DB);
    repairMissingExpiryDates(DB);
    renamePartnerCompanies(DB);
    // (no automatic expiry rewrite here any more — see loadDB)
    saveDBToLocalStorage(DB); // safe against storage-quota errors — a caching failure here
    // must never block the unlock/pull itself, since the real data was already successfully
    // retrieved from the server and is correctly sitting in memory at this point
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    setOfflineBanner(false);
    checkServerSchema(); // don't block the pull on this — just surface a warning if it's stale
    if(keptLocalEdits) scheduleServerSync(); // send the kept local edits up
    return {ok:true, keptLocalEdits};
  }catch(err){
    const message = err.name==='AbortError'
      ? (LANG==='zh'?'连接超时——请确认设备已连接到店内网络，且服务器电脑已开机':'Connection timed out — check that this device is on the store\'s network and the server computer is turned on')
      : err.message;
    console.warn('Could not reach server on load, using local data:', message);
    setOfflineBanner(true, message);
    return {ok:false, error: message};
  }
}
// Deletes a customer on the server too (cascades to their services automatically, via the
// database's foreign key). This is necessary because /api/sync is deliberately upsert-only
// (it never removes anything missing from a push, to protect against accidental data loss
// from an incomplete sync payload) — so a customer removed only from local state would keep
// reappearing after every pull unless this explicit delete also runs. Used by both "Delete
// customer" and merging duplicates (which removes the older, folded-in record).
async function deleteCustomerOnServer(id){
  if(syncBaseline) syncBaseline.customers.delete(id);
  if(!isSyncEnabled()) return {ok:true};
  const base = getServerUrl();
  const pend = getPendingDeletes(); if(!pend.includes(id)){ pend.push(id); setPendingDeletes(pend); }
  try{
    const res = await fetch(base+'/api/customers/'+id, {method:'DELETE', headers: authHeaders()});
    if(!res.ok && res.status!==404) throw new Error('HTTP '+res.status);
    setPendingDeletes(getPendingDeletes().filter(x=>x!==id));
    setOfflineBanner(false);
    return {ok:true};
  }catch(err){
    console.warn('Could not delete customer on the server — it may reappear after the next pull until this succeeds:', err.message);
    setOfflineBanner(true, err.message);
    return {ok:false, error: err.message};
  }
}
function updateSyncStatusUI(errorMsg){
  const el = document.getElementById('syncStatusText');
  if(!el) return;
  if(!isSyncEnabled()){ el.textContent = LANG==='zh'?'未启用服务器同步':'Server sync is off'; return; }
  if(errorMsg){ el.textContent = (LANG==='zh'?'同步失败（使用本地数据）：':'Sync failed (using local data): ')+errorMsg; return; }
  const last = getLastSync();
  el.textContent = last ? (LANG==='zh'?'最近同步：':'Last synced: ')+new Date(last).toLocaleString() : (LANG==='zh'?'尚未同步':'Not synced yet');
}

/* ---------------- derived helpers ---------------- */
function getCustomer(id){ return DB.customers.find(c=>c.id===id); }
function customerServices(id){ return DB.services.filter(s=>s.customerId===id); }
/* When a customer was actually acquired: their stored createdAt for customers added through
   this app, falling back to the earliest service activation date for imported/legacy
   customers who never had createdAt set — much more accurate than treating every import as
   "joined today". */
function customerJoinDate(c){
  if(c.createdAt) return c.createdAt;
  const svcs = customerServices(c.id).map(s=>s.activationDate).filter(isIsoDate).sort();
  return svcs.length ? svcs[0] : null;
}
/* Real percentage change between two numbers, for dashboard trend arrows — replaces the
   previous hardcoded "+12%"/"+8%" placeholders that never reflected actual data. */
function computeDelta(current, previous){
  if(!previous && !current) return {pct:0, up:true, na:true};
  if(!previous) return {pct:0, up:true, isNew:true, na:false};
  const pct = Math.round(((current-previous)/previous)*100);
  return {pct: Math.abs(pct), up: pct>=0, na:false};
}
/* SIM freeze — postpaid only. Korean carriers generally allow a customer to pause billing
   and usage for up to a fixed cap per contract; 2 months 16 days is modeled as 76 days
   (2×30 + 16) since that's how the limit is actually communicated, not as a precise
   calendar calculation. Stored as an array (not a single freeze object) since a customer
   can freeze more than once across a contract, as long as the total across all of them
   stays within the cap. */
const MAX_FREEZE_DAYS = 76; // 2 months 16 days
function currentFreezeFor(svc){
  const today = todayISO();
  return (svc.freezes||[]).find(f=> f.startDate<=today && today<=f.endDate) || null;
}
function isServiceCurrentlyFrozen(svc){ return !!currentFreezeFor(svc); }
function totalFrozenDaysUsed(svc){
  return (svc.freezes||[]).reduce((sum,f)=> sum + (daysBetween(f.startDate, f.endDate)+1), 0);
}
function computedStatus(svc){
  // a subscription that's been explicitly superseded (via Change Plan / Change to Postpaid /
  // Cancel Subscription) is never "active" again, no matter what its expiry date says —
  // otherwise it keeps showing a green "Active" pill and looks like a duplicate subscription
  if(isSubscriptionType(svc.type) && svc.isActive===false) return 'superseded';
  if(svc.status==='cancelled') return 'cancelled';
  if(svc.status==='payment_pending' || svc.status==='docs_pending') return svc.status;
  if(!svc.expiryDate) return svc.status||'active';
  const d = daysBetween(todayISO(), svc.expiryDate);
  if(d < 0) return svc.type==='postpaid' ? 'over_contract' : 'expired';
  if(d <= 7) return 'expiring_soon';
  return 'active';
}

/* ============================================================
   Subscription lifecycle — enforces "one customer = one active
   subscription". This is the ONLY code path allowed to create or
   end a prepaid/postpaid subscription, so the rule can't be bypassed
   no matter which button or flow triggers it (per requirement #7).
   ============================================================ */
/* Only 'prepaid' and 'postpaid' service records represent a subscription that this rule
   applies to — porting/transfer/topup/cancel-log entries are just transactional records
   and don't compete for the "one active subscription" slot. */
function isSubscriptionType(type){ return type==='prepaid' || type==='postpaid'; }
function activeSubscriptionFor(customerId){
  return DB.services.find(s=>s.customerId===customerId && s.isActive) || null;
}
function subscriptionHistoryFor(customerId){
  return DB.services.filter(s=>s.customerId===customerId && isSubscriptionType(s.type) && !s.isActive)
    .sort((a,b)=> (b.endedSeq||0)-(a.endedSeq||0) || new Date(b.endedAt||b.activationDate||0)-new Date(a.endedAt||a.activationDate||0));
}
/* Ends whatever subscription is currently active for this customer (if any) and activates
   newServiceData as the new one. This is the single choke point for every "new subscription",
   "change to postpaid", and "change plan" action, so duplicates are structurally impossible. */
function setActiveSubscription(customerId, newServiceData, reason){
  DB.services.filter(s=>s.customerId===customerId && s.isActive).forEach(s=>{
    s.isActive = false;
    s.endedAt = todayISO();
    s.endedSeq = Date.now(); // millisecond-precision tiebreak so same-day history sorts correctly
    s.changeReason = reason || 'other';
  });
  const svc = { id: uid('s'), isActive:true, endedAt:null, changeReason:'new', ...newServiceData, customerId };
  DB.services.push(svc);
  const cust = getCustomer(customerId);
  if(cust && isSubscriptionType(svc.type)) cust.subType = svc.type;
  return svc;
}
/* Ends the active subscription with no replacement — e.g. the customer is discontinuing. */
function endActiveSubscription(customerId, reason){
  const actives = DB.services.filter(s=>s.customerId===customerId && s.isActive);
  actives.forEach(s=>{ s.isActive=false; s.endedAt=todayISO(); s.endedSeq=Date.now(); s.changeReason=reason||'cancelled'; });
  return actives;
}
/* Brings an inactive customer back — restores their most recent plan to active, exactly as
   it was (same price, discount, company, carrier, notes). Works whether they became
   inactive from an explicit cancellation or their plan simply running out naturally; those
   are different situations, but "bring this customer back" is the same action either way.
   If the old expiry date has already passed (the common case for a naturally-expired
   customer), it's extended forward from today using the same duration, so restoring them
   actually makes them active again instead of leaving them looking expired a second time. */
function undoCancellation(customerId){
  const cust = getCustomer(customerId);
  if(!cust) return;
  const mostRecent = [...customerServices(customerId)].filter(s=>isSubscriptionType(s.type)).sort((a,b)=> (b.endedSeq||0)-(a.endedSeq||0))[0];
  if(!mostRecent) return;
  // any OTHER service that's currently (incorrectly) marked active gets closed first, so
  // restoring this one can't ever leave the customer with two active plans at once
  DB.services.filter(s=>s.customerId===customerId && s.isActive && s.id!==mostRecent.id).forEach(s=>{ s.isActive=false; });
  mostRecent.isActive = true;
  mostRecent.endedAt = null;
  mostRecent.endedSeq = null;
  mostRecent.changeReason = 'new';
  if(mostRecent.expiryDate && mostRecent.expiryDate < todayISO() && mostRecent.durationDays){
    const d = new Date(); d.setDate(d.getDate()+Number(mostRecent.durationDays));
    mostRecent.activationDate = todayISO();
    mostRecent.expiryDate = d.toISOString().slice(0,10);
  }
  if(isSubscriptionType(mostRecent.type)) cust.subType = mostRecent.type;
  saveDB(DB);
  toast(t('toast.cancellationUndone'));
  openCustomerDetail(customerId);
  renderPage(currentPage);
  renderNav();
}
/* Migration/self-heal pass for data saved before isActive existed, or any inconsistent state
   (e.g. more than one active record for a customer, however that happened) — guarantees the
   invariant holds even for old data, per requirement #7. */
function repairActiveSubscriptions(db){
  let changed = false;
  const byCustomer = {};
  (db.services||[]).forEach(s=>{
    if(s.isActive===undefined) changed = true;
    if(!isSubscriptionType(s.type)) return; // porting/transfer/topup/etc are never "the" active subscription
    (byCustomer[s.customerId] = byCustomer[s.customerId]||[]).push(s);
  });
  Object.values(byCustomer).forEach(svcs=>{
    const activeCount = svcs.filter(s=>s.isActive).length;
    const allMarked = svcs.every(s=>s.isActive!==undefined);
    if(allMarked && activeCount<=1) return;
    changed = true;
    const sorted = [...svcs].sort((a,b)=> new Date(b.activationDate||0)-new Date(a.activationDate||0));
    const winner = sorted.find(s=>{ const st=computedStatus(s); return st!=='expired' && st!=='cancelled'; }) || sorted[0];
    svcs.forEach(s=>{
      if(s===winner){ s.isActive=true; s.endedAt=null; if(!s.changeReason) s.changeReason='new'; }
      else{ s.isActive=false; if(!s.endedAt) s.endedAt = s.expiryDate || s.activationDate || todayISO(); if(!s.changeReason) s.changeReason='other'; }
    });
  });
  // non-subscription service types (porting/transfer/topup/cancel) are simply never "active"
  (db.services||[]).forEach(s=>{ if(!isSubscriptionType(s.type) && s.isActive===undefined){ s.isActive=false; changed=true; } });
  if(changed) saveDB(db);
}

/* ============================================================
   AI BUSINESS INTELLIGENCE ENGINE
   Two clearly separated layers, per spec:
   - Eligibility Engine: deterministic business rules (age, contract dates,
     ID completeness). Never guesses — if data is missing, it says so.
   - Opportunity Scoring: a transparent, explainable weighted-scoring
     formula (not a black-box ML model) that ranks customers by business
     value. Every number shown is computed live from real CRM data.
   ============================================================ */
const POSTPAID_MIN_AGE = 19; // Korean legal adult age — postpaid requires a credit-liable adult
const CONTRACT_APPROACHING_DAYS = 30;
const ELIGIBLE_SOON_DAYS = 90;

/* ---- Eligibility Engine ---- */
/* Three stay-duration-driven opportunity categories, distinct from the existing AI
   opportunity engine above (which is score/priority based and covers many signal types at
   once). These are specifically about matching an offer to how much longer a customer
   plans to remain in Korea, using the "Years in Korea" field — which, in how this store
   actually uses it, records REMAINING intended stay rather than time already spent, so it
   can be read directly as a countdown rather than needing any new field on the form.
     🟢 readyForPostpaid — prepaid customers old enough, ID-verified, and staying long
        enough that postpaid's better per-month value would suit them.
     🔵 prepaidRecharge — prepaid customers on a 1/2/3-month plan running out soon who are
        still sticking around, so recharging (not converting) is the right offer.
     🟣 postpaidUpgrade — customers whose postpaid contract already ended who are staying
        8+ more months, worth a fresh longer-term contract rather than lapsing. */
function getStayBasedOpportunities(){
  const readyForPostpaid = [], prepaidRecharge = [], postpaidUpgrade = [], finishedNeedsRecharge = [];
  DB.customers.forEach(c=>{
    const svc = activeSubscriptionFor(c.id);
    if(!svc) return;
    const age = calcAge(c.dob);
    const years = Number(c.years);
    const hasYears = c.years!==undefined && c.years!=='' && !isNaN(years);
    // "Years in Korea" is stated ONCE, the first time a customer signs up — it's a
    // countdown from THAT moment, and needs to keep counting down across every recharge
    // afterward, not reset at each one. Someone who said "1 year" at their very first
    // signup, then did a 3-month prepaid plan followed by a 1-month recharge, has used up
    // 4 of those 12 months by the time the recharge ends — not just the 1 month of the
    // most recent service alone. Measuring from the earliest prepaid activation on record
    // (rather than the current/most recent one) is what makes that accumulate correctly.
    const earliestPrepaidDate = customerServices(c.id).filter(s=>s.type==='prepaid' && s.activationDate).map(s=>s.activationDate).sort()[0];
    const monthsElapsedSinceStated = hasYears && earliestPrepaidDate ? daysBetween(earliestPrepaidDate, todayISO())/30.44 : 0;
    const remainingStayYears = hasYears ? years - (monthsElapsedSinceStated/12) : null;
    if(svc.type==='prepaid'){
      // "Ready for postpaid" now surfaces as soon as someone qualifies by age/ID/stay —
      // even while their current prepaid plan is still running. Staff can go ahead and set
      // up the postpaid switch early rather than waiting for the prepaid period to actually
      // run out; the row still shows how many days are left on the current plan (via
      // `days`, computed below from svc.expiryDate) so it's clear at a glance whether it's
      // "ends in 4 days" or already finished. Both Passport and ARC holders qualify now —
      // previously this required Passport specifically. The under-19 case is unchanged:
      // it's a heads-up countdown, not an action to take right now, so it doesn't wait on
      // plan status at all — someone turning 19 in 3 months is worth knowing about whether
      // their current plan still has 80 days left or has already run out.
      const eligibleForPostpaid = age!==null && age>=POSTPAID_MIN_AGE && (c.idType==='Passport' || c.idType==='ARC') && hasYears && remainingStayYears>=(8/12);
      if(age!==null && age<POSTPAID_MIN_AGE){
        const bday = new Date(c.dob);
        const nextBday = new Date(bday.getFullYear()+POSTPAID_MIN_AGE, bday.getMonth(), bday.getDate());
        const daysUntil19 = isNaN(nextBday.getTime()) ? null : daysBetween(todayISO(), nextBday.toISOString().slice(0,10));
        readyForPostpaid.push({customer:c, service:svc, subStatus:'underage', daysUntil19});
      } else if(eligibleForPostpaid){
        readyForPostpaid.push({customer:c, service:svc, subStatus:'eligible', remainingStayYears});
      }
      if([30,60,90].includes(Number(svc.durationDays)) && computedStatus(svc)==='expiring_soon' && hasYears && years>0){
        prepaidRecharge.push({customer:c, service:svc});
      }
      // Plan already ran out, and postpaid isn't an option for them — either they're under
      // 19, or they simply won't be in Korea long enough to make postpaid worthwhile — but
      // they still have SOME real time left, so recharging (not upgrading) is the only
      // move that makes sense. Age-eligible-but-otherwise-excluded people still land here
      // too (e.g. no passport on file) since the recommendation is the same either way:
      // recharge, since postpaid isn't happening right now regardless of the reason.
      if(computedStatus(svc)==='expired' && !eligibleForPostpaid && hasYears && remainingStayYears>0){
        finishedNeedsRecharge.push({customer:c, service:svc, remainingStayYears});
      }
    } else if(svc.type==='postpaid'){
      if(computedStatus(svc)==='over_contract' && hasYears && remainingStayYears>=(8/12)){
        postpaidUpgrade.push({customer:c, service:svc, remainingStayYears});
      }
    }
  });
  return {readyForPostpaid, prepaidRecharge, postpaidUpgrade, finishedNeedsRecharge};
}
/* All three categories above silently skip anyone missing the data they need to judge —
   there's no way to tell if someone's "ready" without knowing their ID type or expected
   stay, so leaving them out (rather than guessing) is correct. But that silence can make
   the counts look mysteriously low with no way to tell why. This walks the same candidate
   pools and counts specifically who got skipped and for which missing field, so that's
   visible instead of hidden. */
function getStayBasedDiagnostics(){
  const missingYearsOnly=[], missingIdTypeOnly=[], missingBoth=[], noDobOnExpiredPlan=[];
  DB.customers.forEach(c=>{
    const svc = activeSubscriptionFor(c.id);
    if(!svc) return;
    const age = calcAge(c.dob);
    const hasYears = c.years!==undefined && c.years!=='' && !isNaN(Number(c.years));
    // "Ready for postpaid" no longer waits for the prepaid plan to actually expire — anyone
    // old enough is a candidate regardless of their current plan's status (matches the
    // eligibility check in getStayBasedOpportunities above).
    const isCandidate = (svc.type==='prepaid' && age!==null && age>=POSTPAID_MIN_AGE)
      || (svc.type==='prepaid' && [30,60,90].includes(Number(svc.durationDays)) && computedStatus(svc)==='expiring_soon')
      || (svc.type==='postpaid' && computedStatus(svc)==='over_contract');
    if(!isCandidate) return;
    const needsIdType = svc.type==='prepaid' && age!==null && age>=POSTPAID_MIN_AGE;
    // Both Passport and ARC are valid now — only flag as "missing" if it's neither.
    const missingId = needsIdType && c.idType!=='Passport' && c.idType!=='ARC';
    const missingYr = !hasYears;
    if(missingId && missingYr) missingBoth.push(c);
    else if(missingId) missingIdTypeOnly.push(c);
    else if(missingYr) missingYearsOnly.push(c);
  });
  DB.customers.forEach(c=>{
    const svc = activeSubscriptionFor(c.id);
    if(svc && svc.type==='prepaid' && calcAge(c.dob)===null) noDobOnExpiredPlan.push(c);
  });
  return {missingYearsOnly, missingIdTypeOnly, missingBoth, noDobOnExpiredPlan,
    total: missingYearsOnly.length+missingIdTypeOnly.length+missingBoth.length+noDobOnExpiredPlan.length};
}
function eligPostpaidConversion(c){
  const active = activeSubscriptionFor(c.id);
  if(!active || active.type!=='postpaid'){
    const age = calcAge(c.dob);
    if(age===null) return {status:'unknown', reason:t('ai.elig.noDob')};
    if(age>=POSTPAID_MIN_AGE) return {status:'eligible', reason:t('ai.elig.ageOk').replace('{age}',age)};
    const bday = new Date(c.dob);
    const nextBday = new Date(bday.getFullYear()+POSTPAID_MIN_AGE, bday.getMonth(), bday.getDate());
    if(isNaN(nextBday.getTime())) return {status:'unknown', reason:t('ai.elig.noDob')};
    const days = daysBetween(todayISO(), nextBday.toISOString().slice(0,10));
    if(days<=ELIGIBLE_SOON_DAYS) return {status:'soon', reason:t('ai.elig.turningAge').replace('{days}',days), days};
    return {status:'not_yet', reason:t('ai.elig.tooYoung').replace('{age}',age)};
  }
  return {status:'na', reason:t('ai.elig.alreadyPostpaid')};
}
function eligContractStatus(c){
  const active = activeSubscriptionFor(c.id);
  if(!active || active.type!=='postpaid' || !active.expiryDate || !isIsoDate(active.expiryDate)) return {status:'na'};
  const days = daysBetween(todayISO(), active.expiryDate);
  if(days<0) return {status:'completed', daysSince:Math.abs(days), reason:t('ai.elig.contractCompleted').replace('{days}',Math.abs(days))};
  if(days<=CONTRACT_APPROACHING_DAYS) return {status:'approaching', daysUntil:days, reason:t('ai.elig.contractApproaching').replace('{days}',days)};
  return {status:'mid', daysUntil:days, reason:t('ai.elig.contractMid').replace('{days}',days)};
}
function eligResidentCard(c){
  if(c.idType!=='ARC') return {status:'not_eligible', reason:t('ai.elig.needsArc')};
  if(!c.idNumber) return {status:'needs_verification', reason:t('ai.elig.missingIdNumber')};
  if(!c.idExpiry || !isIsoDate(c.idExpiry)) return {status:'needs_verification', reason:t('ai.elig.missingIdExpiry')};
  if(daysBetween(todayISO(), c.idExpiry) < 0) return {status:'needs_verification', reason:t('ai.elig.idExpired')};
  return {status:'eligible', reason:t('ai.elig.idComplete')};
}
function churnRisk(c){
  const active = activeSubscriptionFor(c.id);
  if(!active){
    const hist = subscriptionHistoryFor(c.id);
    if(!hist.length) return {level:'none', score:0};
    const daysSince = daysBetween(hist[0].endedAt||hist[0].activationDate, todayISO());
    return {level:'high', score:85, reason:t('ai.churn.noActive').replace('{days}',daysSince)};
  }
  const st = computedStatus(active);
  if(st==='expired' || st==='over_contract') return {level:'high', score:80, reason: st==='over_contract' ? t('ai.churn.overContract') : t('ai.churn.expired')};
  if(st==='expiring_soon') return {level:'medium', score:50, reason:t('ai.churn.expiringSoon')};
  const outstanding = Math.max(0,(active.sellingPrice||0)-(active.received||0));
  if(outstanding>0) return {level:'medium', score:40, reason:t('ai.churn.outstanding')};
  return {level:'low', score:10, reason:t('ai.churn.stable')};
}
/* This business earns a ONE-TIME commission per signup from the carrier — not recurring
   monthly revenue. Staff type in an estimate at signup ("expected profit"); the carrier
   tells them the real number at month-end ("actual profit") for manual reconciliation.
   Discounts given to the customer (a per-month amount over N months) reduce that profit. */
function discountTotalFor(svc){
  if(!svc) return 0;
  return (Number(svc.discountPerMonth)||0) * (Number(svc.discountMonths)||0);
}
// "Expected income" until the carrier's real settlement figure is filled in, then
// "Actual income" — used anywhere a single specific service's net figure is labeled
function netIncomeLabelFor(svc){
  return svc && svc.actualProfit ? t('f.actualIncome') : t('f.expectedIncome');
}
/* expected income = Company Price (catalog estimate) − discount − USIM fee
   actual income   = Real Company Price (carrier's final settlement) − discount − USIM fee,
   once that real figure has been filled in — this one function is used everywhere profit
   is shown (Dashboard, Reports, Customer Detail, Sheet View, Orders, AI Insights), so this
   is the single place the formula needs to be correct. */
function netProfitFor(svc){
  if(!svc) return 0;
  const gross = svc.actualProfit ? Number(svc.actualProfit) : Number(svc.expectedProfit)||0;
  // never a negative "income" — if there's no real company price known yet (0), that means
  // "not estimated," not "this signup is expected to lose money"
  return Math.max(0, gross - discountTotalFor(svc) - (Number(svc.usimFee)||0));
}
/* The one true "how much did this transaction earn us" figure — prepaid is its full one-time
   catalog price, postpaid is the tracked expected/actual profit net of discount, and every
   other transactional type (porting/transfer/topup/cancel) keeps the original received-based
   bookkeeping. Used anywhere revenue needs to be totaled across a mixed list of services —
   Dashboard and Reports must both use this so postpaid isn't silently dropped from the numbers. */
function totalRevenueFor(svc){
  if(!svc) return 0;
  if(svc.type==='prepaid') return Number(svc.sellingPrice)||0;
  if(svc.type==='postpaid') return netProfitFor(svc);
  return Number(svc.received)||0;
}
function monthlyEquivRevenue(svc){
  if(!svc) return 0;
  // prefer real profit tracking when available; fall back to the old estimate only for
  // legacy records saved before profit tracking existed
  if(svc.expectedProfit || svc.actualProfit) return netProfitFor(svc);
  if(svc.type==='postpaid') return Number(svc.monthlyFee)||0;
  if(svc.type==='prepaid') return (Number(svc.sellingPrice)||0)/3;
  return 0;
}
function avgActivePostpaidRevenue(){
  const active = DB.customers.map(c=>activeSubscriptionFor(c.id)).filter(s=>s && s.type==='postpaid');
  const withProfit = active.filter(s=>s.expectedProfit||s.actualProfit);
  if(withProfit.length) return withProfit.reduce((a,s)=>a+netProfitFor(s),0)/withProfit.length;
  const withFee = active.filter(s=>s.monthlyFee>0);
  if(!withFee.length) return 0;
  return withFee.reduce((a,s)=>a+Number(s.monthlyFee),0)/withFee.length;
}
/* ---- Opportunity Scoring (transparent weighted formula) ---- */
function computeCustomerIntelligence(c){
  const active = activeSubscriptionFor(c.id);
  const postpaidElig = eligPostpaidConversion(c);
  const contractStatus = eligContractStatus(c);
  const residentCard = eligResidentCard(c);
  const churn = churnRisk(c);
  const currentRevenue = monthlyEquivRevenue(active);
  const avgPostpaidRev = avgActivePostpaidRevenue();

  let opportunityType = 'none', score = 0, potentialRevenue = currentRevenue, reasonParts = [];

  if(active && active.type==='prepaid' && postpaidElig.status==='eligible'){
    opportunityType = 'postpaid_conversion';
    score += 45;
    potentialRevenue = avgPostpaidRev || currentRevenue*3;
    reasonParts.push(t('ai.reason.postpaidReady'));
  } else if(active && active.type==='prepaid' && postpaidElig.status==='soon'){
    opportunityType = 'postpaid_conversion_soon';
    score += 20;
    reasonParts.push(postpaidElig.reason);
  }
  if(contractStatus.status==='completed'){
    score += 30;
    if(opportunityType==='none') opportunityType = 'plan_review';
    reasonParts.push(contractStatus.reason);
  } else if(contractStatus.status==='approaching'){
    score += 15;
    if(opportunityType==='none') opportunityType = 'renewal_followup';
    reasonParts.push(contractStatus.reason);
  }
  if(residentCard.status==='needs_verification'){
    score += 10;
    if(opportunityType==='none') opportunityType = 'id_verification';
    reasonParts.push(residentCard.reason);
  }
  if(churn.level==='high'){
    score += 25;
    opportunityType = active ? opportunityType : 'winback';
    reasonParts.push(churn.reason);
  } else if(churn.level==='medium'){
    score += 10;
    reasonParts.push(churn.reason);
  }
  const joinDate = customerJoinDate(c);
  if(joinDate){
    const tenureMonths = monthsSince(joinDate) || 0;
    score += Math.min(10, Math.floor(tenureMonths/6));
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  let priority = 'none';
  if(score>=55) priority = 'high';
  else if(score>=30) priority = 'medium';
  else if(score>=10) priority = 'low';

  const actionMap = {
    postpaid_conversion:'ai.action.postpaidConversion',
    postpaid_conversion_soon:'ai.action.waitEligibility',
    plan_review:'ai.action.planReview',
    renewal_followup:'ai.action.renewalFollowup',
    id_verification:'ai.action.idVerification',
    winback:'ai.action.winback',
    none:'ai.action.none',
  };

  return {
    customer:c, active, postpaidElig, contractStatus, residentCard, churn,
    opportunityType, score, priority,
    currentRevenue, potentialRevenue, uplift: Math.max(0, potentialRevenue-currentRevenue),
    recommendedAction: t(actionMap[opportunityType]||actionMap.none),
    reason: reasonParts.filter(Boolean).join(' · ') || t('ai.reason.noAction'),
  };
}
function computeAllIntelligence(){
  return DB.customers.map(computeCustomerIntelligence);
}
function computeBISummary(){
  const all = computeAllIntelligence();
  const currentRevenue = all.reduce((a,x)=>a+x.currentRevenue,0);
  const potentialAdditional = all.reduce((a,x)=>a+x.uplift,0);
  const postpaidOpps = all.filter(x=>x.opportunityType==='postpaid_conversion');
  const postpaidOppsSoon = all.filter(x=>x.opportunityType==='postpaid_conversion_soon');
  const planReview = all.filter(x=>x.opportunityType==='plan_review');
  const renewalFollowup = all.filter(x=>x.opportunityType==='renewal_followup');
  const idVerification = all.filter(x=>x.residentCard.status==='needs_verification');
  const atRisk = all.filter(x=>x.churn.level==='high'||x.churn.level==='medium');
  const atRiskRevenue = atRisk.reduce((a,x)=>a+x.currentRevenue,0);
  const highPriority = all.filter(x=>x.priority==='high');
  return {
    all, currentRevenue, potentialAdditional,
    postpaidOpps, postpaidOppsSoon, planReview, renewalFollowup, idVerification,
    atRisk, atRiskRevenue, highPriority,
  };
}
function statusPillClass(st){
  return {active:'pill-green',payment_pending:'pill-orange',docs_pending:'pill-orange',expiring_soon:'pill-orange',expired:'pill-red',over_contract:'pill-orange',cancelled:'pill-gray',completed:'pill-green',waiting:'pill-orange',superseded:'pill-gray'}[st]||'pill-gray';
}

/* reminders are derived from services + customers, with a persisted state map (id -> status) */
/* Unlike buildReminders() (which only surfaces things due within 30 days, since that's
   built for actionable near-term follow-ups), this covers EVERY current prepaid
   subscription regardless of how far off its expiry is — someone asking "show me everyone
   who signed up this month" wants to see their 90-day customers too, not just the ones
   who happen to fall inside a 30-day window. Cancelled/superseded plans are excluded since
   they're not a meaningful "expired" for this purpose — this is about plans running their
   natural course, not ones someone explicitly ended. */
function getPrepaidCohortList(){
  const now = todayISO();
  return DB.customers.map(c=>{
    const svc = activeSubscriptionFor(c.id);
    if(!svc || svc.type!=='prepaid') return null;
    const status = computedStatus(svc); // 'expired' | 'expiring_soon' | 'active' (or others we don't care about here)
    if(!['expired','expiring_soon','active'].includes(status)) return null;
    return {customer:c, service:svc, status, daysLeft: svc.expiryDate ? daysBetween(now, svc.expiryDate) : null};
  }).filter(Boolean);
}
/* Postpaid contract status, kept deliberately separate from prepaid expiry (and out of the
   generic "overdue" reminder tabs) because "over contract" doesn't mean the same thing as
   "expired" — the service keeps running exactly as before either way. Being over-contract
   just means the lock-in period has passed, so the customer is FREE to change plans now,
   not that they need to. Treating it as an urgent red "overdue" item — the same visual
   language used for a prepaid SIM that's actually stopped working — would misrepresent a
   status that's really just an open option. */
function getPostpaidContractList(){
  const now = todayISO();
  return DB.customers.map(c=>{
    const svc = activeSubscriptionFor(c.id);
    if(!svc || svc.type!=='postpaid') return null;
    const status = computedStatus(svc); // 'over_contract' | 'expiring_soon' | 'active' (or others we don't care about here)
    if(!['over_contract','expiring_soon','active'].includes(status)) return null;
    return {customer:c, service:svc, status, daysLeft: svc.expiryDate ? daysBetween(now, svc.expiryDate) : null};
  }).filter(Boolean);
}
function getPendingIdChangeRequests(){
  return DB.customers
    .filter(c=> c.idChangeRequest && c.idChangeRequest.status==='pending')
    .map(c=> ({customer:c, request:c.idChangeRequest, daysPending: daysBetween(c.idChangeRequest.requestedDate, todayISO())}))
    .sort((a,b)=> b.daysPending - a.daysPending); // longest-waiting first — those are most overdue for a follow-up
}
function buildReminders(){
  const list = [];
  const now = todayISO();
  DB.services.forEach(svc=>{
    if(svc.status==='cancelled') return;
    // a prepaid/postpaid plan that was replaced (recharge, plan change, cancellation) is
    // history — only the customer's CURRENT plan should create follow-up reminders,
    // otherwise every old recharge keeps showing as "overdue" forever
    if(isSubscriptionType(svc.type) && svc.isActive===false) return;
    const cust = getCustomer(svc.customerId);
    if(!cust) return;
    if(svc.expiryDate){
      const dleft = daysBetween(now, svc.expiryDate);
      // prepaid expiry reminders 30/14/7/1 & postpaid contract end
      const isPrepaid = svc.type==='prepaid' || svc.type==='topup' || svc.type==='porting' || svc.type==='transfer';
      const thresholds = [30,14,7,1,0];
      if(dleft<=30){
        const kind = (svc.type==='postpaid') ? 'contract_end' : 'expiry';
        list.push({
          id:'r_'+svc.id+'_exp', customerId:cust.id, serviceId:svc.id, type:kind,
          dueDate:svc.expiryDate, daysLeft:dleft,
          title:cust.name, sub:svc.carrier+' · '+svc.plan
        });
      }
    }
    // first payment reminder
    if(svc.status==='payment_pending'){
      list.push({id:'r_'+svc.id+'_pay', customerId:cust.id, serviceId:svc.id, type:'payment', dueDate:svc.activationDate||now, daysLeft:daysBetween(now,svc.activationDate||now), title:cust.name, sub:svc.carrier+' · '+svc.plan});
    }
    // discount/renewal end placeholder — reuse expiry if discount present
    // info change auto-rule: prepaid service, customer uses passport OR under 19
    const age = calcAge(cust.dob);
    const isMinor = age!==null && age<19;
    if((svc.type==='prepaid') && (cust.idType==='Passport' || isMinor) && computedStatus(svc)!=='cancelled' && computedStatus(svc)!=='expired'){
      list.push({id:'r_'+svc.id+'_info', customerId:cust.id, serviceId:svc.id, type:'info_change', dueDate:svc.expiryDate||now, daysLeft:daysBetween(now,svc.expiryDate||now), title:cust.name, sub:(cust.idType==='Passport'? (LANG==='zh'?'护照登记':'Registered with passport') : (LANG==='zh'?'客户未满19岁':'Customer under 19'))});
    }
  });
  // apply persisted status
  list.forEach(r=>{ r.uiStatus = DB.reminderState[r.id] || 'pending'; });
  // safety net: drop any reminder whose date couldn't be understood, rather than showing "NaN days left"
  const clean = list.filter(r=> isIsoDate(r.dueDate) && !isNaN(r.daysLeft));
  // sort by due date
  clean.sort((a,b)=> new Date(a.dueDate) - new Date(b.dueDate));
  return clean;
}

/* ---------------- rendering: shell ---------------- */
const NAV_ITEMS = [
  {key:'dashboard', icon:'grid', label:'nav.dashboard'},
  // "Customers" as a standalone page was merged into Sheet View (which now has its own
  // search/filters plus Inactive/Duplicate tabs) — no longer a separate nav destination
  {key:'sheet', icon:'sheet', label:'nav.sheet'},
  {key:'ai', icon:'sparkle', label:'nav.ai'},
  {key:'reminders', icon:'clock', label:'nav.reminders'},
  // (Orders page retired 2026-11-11 — Sheet View lists every plan; other services and edits live in each customer's profile)
  {key:'reports', icon:'chart', label:'nav.reports'},
  {key:'templates', icon:'printer', label:'nav.templates'},
  {key:'io', icon:'cloud', label:'nav.io'},
];
const ICONS = {
  grid:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
  user:'<circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M4.5 20c1.5-4 5-5.5 7.5-5.5S18 16 19.5 20" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  clock:'<circle cx="12" cy="12" r="8.4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  chart:'<path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  cloud:'<path d="M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0117.5 15H17M9 18h8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  printer:'<path d="M7 8V4h10v4M7 17h10v4H7v-4zM5 8h14a2 2 0 012 2v5h-3M5 15H2v-5a2 2 0 012-2h0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>',
  sheet:'<rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M4 10h16M9 4v16" stroke="currentColor" stroke-width="1.6"/>',
  sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/>',
};
let currentPage = 'dashboard';
let reminderTab = 'today';
let reminderSignupMonth = 'all'; // used only by the "expiring" tab's filters
let reminderDurationFilter = 'all';
let reminderNationalityFilter = 'all';
let reminderStatusFilter = 'all'; // 'all' | 'expired' | 'expiring_soon' | 'active'

function renderNav(){
  // badge = due today + this week only; overdue / old backlog lives in its own tabs, and
  // postpaid over-contract in its own tab (see remBadgeCount)
  const dueSoonCount = remBadgeCount();
  const nav = document.getElementById('navMenu');
  nav.innerHTML = NAV_ITEMS.map(it=>{
    const badge = it.key==='reminders' && dueSoonCount>0 ? `<span class="nav-badge">${dueSoonCount}</span>` : '';
    return `<a class="nav-item ${currentPage===it.key?'active':''}" data-nav="${it.key}"><svg viewBox="0 0 24 24">${ICONS[it.icon]}</svg><span data-i18n="${it.label}">${t(it.label)}</span>${badge}</a>`;
  }).join('');
}

function goTo(page){
  if(page==='orders') page = 'sheet'; // Orders page retired 2026-11-11 — old links/saved state land on Sheet View
  currentPage = page;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.getElementById('pageTitle').textContent = t('nav.'+page);
  document.getElementById('pageSub').textContent = t('sub.'+page);
  renderNav();
  renderPage(page);
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo(0,0);
}

function renderPage(page){
  if(page==='dashboard') renderDashboard();
  if(page==='customers') renderCustomers();
  if(page==='sheet') renderSheetPage();
  if(page==='ai') renderAIPage();
  if(page==='reminders') renderReminders();
  if(page==='reports') renderReports();
  if(page==='templates') renderTemplates();
  if(page==='io') renderIO();
}

function applyStaticI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{ el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{ el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  document.querySelectorAll('.lang-btn').forEach(b=> b.classList.toggle('active', b.dataset.lang===LANG));
  populateStaticSelects();
}

/* Every address a customer has ever had, remembered as browser-native autocomplete — most
   useful for repeat addresses like shared dorms/apartments where several customers from the
   same university end up typing the exact same thing. Newest-used first, since that's most
   likely to be relevant again soon. */
// Always-available address, in addition to whatever customers have actually used before —
// useful for a common/default address (e.g. the store's own) that should be suggested even
// before any customer record has it.
const DEFAULT_ADDRESS_SUGGESTIONS = ['대전시 동구 동대전로 171'];
/* A real dropdown, matching the style of Carrier Type / Handled By — pass the address of
   whichever customer is currently being edited (if any) so their existing address is always
   included as an option, even if it's unique and not otherwise in the list. Without this,
   opening an existing customer for editing would silently show/select the wrong address the
   moment the dropdown defaults to its first option. */
function populateAddressSuggestions(currentValue){
  const seen = new Set();
  const addresses = [];
  const cur = (currentValue||'').trim();
  if(cur){ seen.add(cur); addresses.push(cur); }
  DEFAULT_ADDRESS_SUGGESTIONS.forEach(a=>{ if(a && !seen.has(a)){ seen.add(a); addresses.push(a); } });
  [...DB.customers].sort((a,b)=> new Date(customerJoinDate(b)||0)-new Date(customerJoinDate(a)||0)).forEach(c=>{
    const addr = (c.address||'').trim();
    if(addr && !seen.has(addr)){ seen.add(addr); addresses.push(addr); }
  });
  if(!addresses.length) addresses.push('');
  document.getElementById('f_address').innerHTML = addresses.map(a=>`<option value="${escapeHtml(a)}">${escapeHtml(a)||'—'}</option>`).join('');
}
function populateStaticSelects(){
  // nationality is now free-text (f_nationality input) — no options to populate
  const fr = document.getElementById('f_referral');
  fr.innerHTML = REFERRALS_KEY.map(k=>`<option value="${k}">${REFERRALS_LABEL[LANG][k]}</option>`).join('');
  const fp = document.getElementById('f_planType');
  fp.innerHTML = PLAN_TYPES.map(([k,l])=>`<option value="${k}">${t(l)}</option>`).join('');
  // order form
  const ot = document.getElementById('o_type');
  ot.innerHTML = SERVICE_TYPES.map(k=>`<option value="${k}">${t('type.'+k)}</option>`).join('');
  const os = document.getElementById('o_status');
  os.innerHTML = STATUSES.map(k=>`<option value="${k}">${t('status.'+k)}</option>`).join('');
  const opm = document.getElementById('o_paymentMethod');
  // Same payment list as the rest of the CRM (customer form, Sheet View, reports). The old
  // separate list here (cash/transfer/card/kakaopay/other) didn't contain alipay / wechat /
  // bank transfer, so opening Edit Order on those customers and saving wiped the method.
  // Legacy values from that old list are still offered so older records keep theirs.
  const payOpts = [...PAYMENT_METHODS, ...PAY_METHODS.filter(k=>!PAYMENT_METHODS.includes(k))];
  opm.innerHTML = `<option value="">—</option>` + payOpts.map(k=>{ const lbl = t('pay.'+k); return `<option value="${escapeHtml(k)}">${escapeHtml(lbl==='pay.'+k ? k : lbl)}</option>`; }).join('');
  // filters — preserve whatever the user already had selected when rebuilding option labels
  // (this is what silently broke the nationality filter: it used to reset to blank on every render)
  const custNat = document.getElementById('custNationalityFilter');
  { const prev = custNat.value; custNat.innerHTML = `<option value="">${t('filter.allNationalities')}</option>` + NATIONALITIES.map(n=>`<option value="${n}">${n}</option>`).join(''); custNat.value = prev; }
  const orderType = document.getElementById('orderTypeFilter');
  if(orderType){ const prev = orderType.value; orderType.innerHTML = `<option value="">${t('filter.allTypes')}</option>` + SERVICE_TYPES.map(k=>`<option value="${k}">${t('type.'+k)}</option>`).join(''); orderType.value = prev; }
  const orderStatus = document.getElementById('orderStatusFilter');
  if(orderStatus){ const prev = orderStatus.value; orderStatus.innerHTML = `<option value="">${t('filter.allStatus')}</option>` + STATUSES.map(k=>`<option value="${k}">${t('status.'+k)}</option>`).join(''); orderStatus.value = prev; }
}

/* ---------------- DASHBOARD ---------------- */
function renderDashboard(){
  const custs = DB.customers;
  const svcs = DB.services;
  const now = new Date();
  const monthStr = localMonthKey(0);
  const lastMonthStr = localMonthKey(-1);

  // postpaid over-contract has its own calm tab and must never count as "due" here
  const reminders = buildReminders().filter(r=>r.uiStatus==='pending' && r.type!=='contract_end');
  const due7 = reminders.filter(r=>{ const b = remBucket(r); return b==='today' || b==='week'; });
  const overdue30 = reminders.filter(r=>remBucket(r)==='overdue');

  // "New this month" — counts customers with ANY service activated this month, not just
  // customers whose record was first created this month. A recharge or a plan-type change
  // (prepaid<->postpaid) creates a genuinely new service that day just as much as a brand
  // new signup does, and should count as "new business today/this month" the same way.
  const custsActivatedInMonth = (monthStr, type) => {
    const ids = new Set(svcs.filter(s=> s.activationDate && s.activationDate.slice(0,7)===monthStr && (!type || s.type===type)).map(s=>s.customerId));
    return custs.filter(c=> ids.has(c.id)).length;
  };
  const newThisMonth = custsActivatedInMonth(monthStr);
  const newLastMonth = custsActivatedInMonth(lastMonthStr);
  const newDelta = computeDelta(newThisMonth, newLastMonth);

  // real revenue this month vs last month
  const monthRevenue = svcs.filter(s=>s.activationDate && s.activationDate.slice(0,7)===monthStr).reduce((a,s)=>a+totalRevenueFor(s),0);
  const lastMonthRevenue = svcs.filter(s=>s.activationDate && s.activationDate.slice(0,7)===lastMonthStr).reduce((a,s)=>a+totalRevenueFor(s),0);
  const revDelta = computeDelta(monthRevenue, lastMonthRevenue);

  // the greeting itself lives in the banner below — the header just names the page
  document.getElementById('pageTitle').textContent = LANG==='zh' ? '仪表盘' : 'Dashboard';
  const heroTitle = document.getElementById('dashHeroTitle');
  if(heroTitle) heroTitle.innerHTML = `${escapeHtml(dashGreetingText())} <span class="dh-count">· ${LANG==='zh' ? '共 '+DB.customers.length+' 位客户' : DB.customers.length+' customers'}</span>`;
  document.getElementById('pageSub').textContent = new Date().toLocaleDateString(LANG==='zh'?'zh-CN':'en-US',{year:'numeric',month:'long',day:'numeric',weekday:'long'});

  const deltaHtml = d => d.na ? '' : (d.isNew ? `<span class="up">${t('stat.newActivity')}</span>` : `<span class="${d.up?'up':'down'}">${d.up?'↑':'↓'} ${d.pct}%</span> ${t('stat.vsLastMonth')}`);
  // total + new-this-month are clickable — show a prepaid/postpaid breakdown popover
  const totalPrepaid = custs.filter(c=>(c.subType||'prepaid')==='prepaid').length;
  const totalPostpaid = custs.filter(c=>c.subType==='postpaid').length;
  const newThisMonthCustomerIds = new Set(svcs.filter(s=> s.activationDate && s.activationDate.slice(0,7)===monthStr).map(s=>s.customerId));
  // Partition by each customer's CURRENT type, not "did they have any service of this type
  // activated this month" — a customer who both recharged prepaid and converted to postpaid
  // in the same month would otherwise get counted in both categories, making the breakdown
  // sum to more than the actual total shown above it (found via a real report: a customer
  // with both a prepaid and postpaid transaction the same month showed as 87 + 15 = 102 in
  // the breakdown while the total correctly read 101 unique customers).
  const newThisMonthPrepaid = custs.filter(c=> newThisMonthCustomerIds.has(c.id) && (c.subType||'prepaid')==='prepaid').length;
  const newThisMonthPostpaid = custs.filter(c=> newThisMonthCustomerIds.has(c.id) && c.subType==='postpaid').length;
  const stats = [
    {label:t('stat.totalCustomers'), value:custs.length, sub:t('stat.fromRecords'), deltaHtml:null, breakdown:{prepaid:totalPrepaid, postpaid:totalPostpaid}},
    {label:t('stat.newThisMonth'), value:newThisMonth, deltaHtml:deltaHtml(newDelta), breakdown:{prepaid:newThisMonthPrepaid, postpaid:newThisMonthPostpaid}},
    {label:LANG==='zh'?'今天和本周到期':'Due today & this week', value:due7.length, sub:(LANG==='zh'?`另有 ${overdue30.length} 个已逾期（30天内）`:`plus ${overdue30.length} overdue (last 30 days)`), deltaHtml:null, orange:true},
    {label:t('stat.revenueMonth'), value:fmtWon(monthRevenue), deltaHtml:deltaHtml(revDelta)},
  ];
  document.getElementById('dashStats').innerHTML = stats.map((s,i)=>`
    <div class="card stat-card" ${s.breakdown?`style="cursor:pointer;" data-stat-breakdown="${i}"`:''}>
      <div class="stat-label">${s.label}</div>
      <div class="stat-value" style="${s.orange?'color:var(--orange)':''}">${s.value}</div>
      <div class="stat-delta">${s.deltaHtml || s.sub || ''}</div>
    </div>`).join('');
  document.querySelectorAll('[data-stat-breakdown]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const s = stats[Number(el.dataset.statBreakdown)];
      const pop = document.getElementById('statBreakdownPopover');
      document.getElementById('statBreakdownTitle').textContent = s.label;
      document.getElementById('statBreakdownBody').innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:20px;padding:6px 4px;">
          <span class="pill pill-orange">${t('opt.prepaidShort')}</span><b>${s.breakdown.prepaid}</b>
        </div>
        <div style="display:flex;justify-content:space-between;gap:20px;padding:6px 4px;">
          <span class="pill pill-blue">${t('opt.postpaidShort')}</span><b>${s.breakdown.postpaid}</b>
        </div>`;
      const rect = el.getBoundingClientRect();
      pop.style.left = rect.left+'px';
      pop.style.top = (rect.bottom+6)+'px';
      pop.style.display = 'block';
    });
  });

  // second stats row: active book composition, money at risk, renewals coming up
  const activePrepaid = custs.filter(c=>{ const a=activeSubscriptionFor(c.id); return a && a.type==='prepaid'; }).length;
  const activePostpaid = custs.filter(c=>{ const a=activeSubscriptionFor(c.id); return a && a.type==='postpaid'; }).length;
  const outstandingTotal = svcs.reduce((a,s)=>a+unpaidOf(s),0);
  const renewalsSoon = getUpcomingRenewals(30);
  const stats2 = [
    {label:t('stat.activePrepaid'), value:activePrepaid, sub:t('stat.activeBook'), color:'var(--orange)', go:'sheet:prepaid'},
    {label:t('stat.activePostpaid'), value:activePostpaid, sub:t('stat.activeBook'), color:'var(--blue)', go:'sheet:postpaid'},
    {label:t('stat.outstanding'), value:fmtWon(outstandingTotal), sub:t('stat.outstandingSub'), color: outstandingTotal>0?'var(--red)':'inherit', go:'sheet:all:unpaid'},
    {label:t('stat.renewalsSoon'), value:renewalsSoon.length, sub:t('stat.renewalsSub'), color:'var(--orange)', go:'rem:postpaidContract'},
  ];
  document.getElementById('dashStats2').innerHTML = stats2.map(s=>`
    <div class="card stat-card stat-link" data-dash-go="${s.go}" title="${LANG==='zh'?'点击查看列表':'Click to see the list'}">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value" style="color:${s.color||'inherit'}">${s.value}</div>
      <div class="stat-delta">${s.sub}</div>
    </div>`).join('');
  // today's prepaid payment method breakdown — same logic and layout as the Daily Report's
  // version, kept right on the dashboard so it's something you glance at each morning
  // instead of something you have to go looking for in Reports
  const todayPrepaid = svcs.filter(s=>s.type==='prepaid' && s.activationDate===todayISO());
  document.querySelectorAll('#dashStats2 [data-dash-go]').forEach(card=> card.addEventListener('click', ()=>{
    const [where, tab, sort] = card.dataset.dashGo.split(':');
    if(where==='rem'){ reminderTab = tab; goTo('reminders'); return; }
    sheetTypeTab = tab;
    const so = document.getElementById('sheetSortOrder'); if(so) so.value = sort || '';
    goTo('sheet');
  }));
  document.getElementById('dashPaymentToday').innerHTML = paymentBreakdownHtml(todayPrepaid,
    LANG==='zh'?'今天还没有先付记录':'No prepaid signups yet today');

  // duplicate customers nudge banner
  const dupeGroups = getDuplicateGroups();
  const dupeBanner = document.getElementById('dashDupeBanner');
  if(dupeGroups.length){
    dupeBanner.style.display = '';
    const n = dupeGroups.reduce((a,g)=>a+g.length,0);
    dupeBanner.innerHTML = `<div class="alert-banner">
      <div class="alert-banner-text">⚠️ ${t('dash.dupeBanner').replace('{groups}',dupeGroups.length).replace('{n}',n)}</div>
      <button class="btn btn-primary" id="dashDupeBannerBtn">${t('dash.dupeBannerBtn')}</button>
    </div>`;
    document.getElementById('dashDupeBannerBtn').addEventListener('click', ()=>{ sheetTypeTab='dupes'; goTo('sheet'); });
  } else {
    dupeBanner.style.display = 'none';
  }

  // followups list (top 4)
  const prio = {today:0, overdue:1, week:2};
  const top = reminders.filter(r=> prio[remBucket(r)]!==undefined)
    .sort((a,b)=> prio[remBucket(a)]-prio[remBucket(b)] || (remBucket(a)==='overdue' ? b.daysLeft-a.daysLeft : a.daysLeft-b.daysLeft))
    .slice(0,4);
  renderDashTodayStrip(reminders, renewalsSoon);
  document.getElementById('dashFollowups').innerHTML = top.length? top.map(r=>renderFollowRow(r)).join('') : emptyState();

  // service overview: prepaid vs postpaid activations this month — kept to just these two
  // categories (not every raw transaction type) since that's the actual question this widget
  // should answer clearly, matching how the rest of the app is organized around this split
  const byType = {};
  svcs.filter(s=>s.activationDate && s.activationDate.slice(0,7)===monthStr && (s.type==='prepaid'||s.type==='postpaid')).forEach(s=>{ byType[s.type]=(byType[s.type]||0)+1; });
  renderDonut(byType);

  // contract renewals (postpaid ending within 30 days)
  renderContractRenewals(renewalsSoon);

  // win-back list (customers with no active subscription, most recently ended first)
  renderWinback();

  // revenue trend, last 6 months
  renderRevenueTrend();

  // cancellation reasons, last 6 months
  renderCancelReasons();

  // recent customers table (by most recent service activation)
  const recentSvcs = [...svcs].sort((a,b)=> new Date(b.activationDate||0)-new Date(a.activationDate||0)).slice(0,6);
  document.getElementById('dashRecentBody').innerHTML = recentSvcs.map(s=>{
    const c = getCustomer(s.customerId); if(!c) return '';
    const st = computedStatus(s);
    return `<tr class="row-click" data-open-customer="${c.id}">
      <td class="name-cell" title="${escapeHtml(c.name)}"><span class="avatar">${initials(c.name)}</span><span class="name-text">${escapeHtml(c.name)}</span></td>
      <td>${s.number||'—'}</td>
      <td>${t('type.'+s.type)}</td>
      <td>${escapeHtml(s.carrier||'—')}</td>
      <td class="nowrap">${fmtDate(s.activationDate)}</td>
      <td><span class="pill ${statusPillClass(st)}">${t('status.'+st)}</span></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6">${emptyState()}</td></tr>`;

  // nationality + referral bar charts
  renderBarChart('chartNationality', groupCount(custs,'nationality'));
  renderBarChart('chartReferral', groupCount(custs,'referral', k=>REFERRALS_LABEL[LANG][k]||k));

  bindRowOpens();
}

/* postpaid customers whose active subscription expires within `days` days */
function getUpcomingRenewals(days){
  return DB.customers.map(c=>({c, svc:activeSubscriptionFor(c.id)}))
    .filter(({svc})=> svc && svc.type==='postpaid' && svc.expiryDate && isIsoDate(svc.expiryDate))
    .map(({c,svc})=>({c, svc, daysLeft:daysBetween(todayISO(), svc.expiryDate)}))
    .filter(x=> x.daysLeft>=0 && x.daysLeft<=days)
    .sort((a,b)=> a.daysLeft-b.daysLeft);
}
function renderContractRenewals(list){
  const el = document.getElementById('dashRenewals');
  if(!list.length){ el.innerHTML = `<div class="empty-state"><b>${t('dash.renewals.emptyTitle')}</b>${t('dash.renewals.emptyDesc')}</div>`; return; }
  el.innerHTML = list.slice(0,5).map(({c,svc,daysLeft})=>`
    <div class="mini-row row-click" data-open-customer="${c.id}">
      <div>
        <div class="mini-row-name">${escapeHtml(c.name)}</div>
        <div class="mini-row-sub">${escapeHtml(svc.plan||svc.carrier||'')} · ${fmtDate(svc.expiryDate)}</div>
      </div>
      <span class="pill ${daysLeft<=7?'pill-red':'pill-orange'}">${daysLeft} ${t('detail.days')}</span>
    </div>`).join('');
  bindRowOpens();
}

/* customers whose most recent subscription was cancelled/ended and never replaced */
function getWinbackCustomers(){
  return DB.customers.filter(c=>!activeSubscriptionFor(c.id))
    .map(c=>{ const h = subscriptionHistoryFor(c.id); return {c, last: h[0]||null}; })
    .filter(x=>x.last) // only customers who actually HAD a subscription before
    .sort((a,b)=> (b.last.endedSeq||0)-(a.last.endedSeq||0));
}
function renderWinback(){
  const list = getWinbackCustomers();
  const el = document.getElementById('dashWinback');
  const viewAllBtn = document.getElementById('dashWinbackViewAll');
  viewAllBtn.style.display = list.length>5 ? '' : 'none';
  if(!list.length){ el.innerHTML = `<div class="empty-state"><b>${t('dash.winback.emptyTitle')}</b>${t('dash.winback.emptyDesc')}</div>`; return; }
  el.innerHTML = list.slice(0,5).map(({c,last})=>`
    <div class="mini-row row-click" data-open-customer="${c.id}">
      <div>
        <div class="mini-row-name">${escapeHtml(c.name)}</div>
        <div class="mini-row-sub">${escapeHtml(last.plan||last.carrier||'')} · ${t('reason.'+(last.changeReason||'other'))}</div>
      </div>
      <span class="pill pill-gray">${fmtDate(last.endedAt)}</span>
    </div>`).join('');
  bindRowOpens();
}
document.getElementById('dashWinbackViewAll').addEventListener('click', ()=>{
  sheetTypeTab = 'inactive';
  goTo('sheet');
});

/* revenue trend: last 6 months of actual received payments */
function renderRevenueTrend(){
  const months = [];
  const now = new Date();
  for(let i=5;i>=0;i--){
    months.push(localMonthKey(-i));
  }
  const cur = localMonthKey(0);
  renderColumnChart('dashRevenueTrend', months.map(m=>{
    const total = DB.services.filter(s=>s.activationDate && s.activationDate.slice(0,7)===m).reduce((a,s)=>a+totalRevenueFor(s),0);
    return {label: shortMonthLabel(m), total, current: m===cur, segments:[{v:total, color: m===cur ? 'var(--orange)' : 'var(--blue)', name:''}]};
  }));
}

/* why customers have cancelled, last 6 months of ended subscriptions */
function renderCancelReasons(){
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth()-6);
  const ended = DB.services.filter(s=> isSubscriptionType(s.type) && s.isActive===false && s.changeReason && s.endedAt && new Date(s.endedAt)>=cutoff
    && (s.changeReason==='cancelled' || s.changeReason==='switched_carrier' || s.changeReason==='other' || s.changeReason==='expired_natural'));
  const pairs = groupCount(ended, 'changeReason', k=>t('reason.'+k));
  const el = document.getElementById('dashCancelReasons');
  if(!pairs.length){ el.innerHTML = `<div class="muted">${t('dash.noCancellations')}</div>`; return; }
  renderBarChart('dashCancelReasons', pairs);
}

/* quick search: type-ahead over name/phone/idNumber, click a result to open their profile */
function renderDashQuickSearchResults(query){
  const el = document.getElementById('dashQuickSearchResults');
  if(!query){ el.innerHTML = ''; el.className = ''; return; }
  const q = query.toLowerCase();
  const matches = DB.customers.filter(c=>{
    const hay = [c.name,c.phone,c.idNumber,c.nationality].join(' ').toLowerCase();
    return hay.includes(q);
  }).slice(0,8);
  el.className = 'qsearch-results';
  if(!matches.length){ el.innerHTML = `<div class="qsearch-empty">${t('dash.noMatches')}</div>`; return; }
  el.innerHTML = matches.map(c=>{
    const active = activeSubscriptionFor(c.id);
    const subLabel = active ? (active.type==='postpaid'?t('opt.postpaidShort'):t('opt.prepaidShort')) : t('detail.noActiveSubscription');
    return `<div class="qsearch-item" data-open-customer="${c.id}">
      <span class="avatar">${initials(c.name)}</span>
      <div>
        <div style="font-weight:700;font-size:13px;">${escapeHtml(c.name)}</div>
        <div class="muted" style="font-size:11.5px;">${escapeHtml(c.phone||'—')} · ${subLabel}</div>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-open-customer]').forEach(row=>{
    row.addEventListener('click', ()=>{
      openCustomerDetail(row.getAttribute('data-open-customer'));
      document.getElementById('dashQuickSearch').value = '';
      el.innerHTML = ''; el.className = '';
    });
  });
}
document.getElementById('dashQuickSearch').addEventListener('input', e=> renderDashQuickSearchResults(e.target.value.trim()));
function emptyState(){ return `<div class="empty-state"><b>${t('rem.empty.title')}</b>${t('rem.empty.desc')}</div>`; }

function dateBadgeParts(dueDate){
  if(!isIsoDate(dueDate)) return {month:'--', day:'--'};
  return {month:dueDate.slice(5,7), day:dueDate.slice(8,10)};
}
function renderFollowRow(r){
  const c = getCustomer(r.customerId);
  const dtxt = r.daysLeft<0 ? `${Math.abs(r.daysLeft)} ${t('rem.overdue')}` : (r.daysLeft===0? t('rem.today') : `${r.daysLeft} ${t('rem.dueIn')}`);
  const {month, day} = dateBadgeParts(r.dueDate);
  return `<div class="service-card" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" data-open-customer="${c?c.id:''}">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="min-width:56px;text-align:center;">
        <div style="font-size:11px;color:var(--text-soft);font-weight:700;">${month}${LANG==='zh'?'月':'/'}</div>
        <div style="font-size:18px;font-weight:800;color:var(--orange)">${day}</div>
      </div>
      <div>
        <div style="font-weight:700;">${c?escapeHtml(c.name):''}</div>
        <div class="muted" style="font-size:12px;">${escapeHtml(r.sub||'')}</div>
      </div>
    </div>
    <span class="pill pill-orange">${dtxt}</span>
  </div>`;
}

function renderDonut(byType){
  const colors = {prepaid:'#2F6FED',postpaid:'#7C5CFC',porting:'#1FA971',transfer:'#E8833A',topup:'#3DC1D3',cancel:'#E5484D'};
  const entries = Object.entries(byType);
  const total = entries.reduce((a,[,v])=>a+v,0);
  const svg = document.getElementById('donutSvg');
  if(total===0){ svg.innerHTML=`<circle cx="21" cy="21" r="15.9" fill="none" stroke="#EDEFF4" stroke-width="6"/>`; document.getElementById('donutLegend').innerHTML=`<div class="muted">—</div>`; return; }
  let offset = 0;
  let circles = '';
  entries.forEach(([k,v])=>{
    const pct = (v/total)*100;
    circles += `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${colors[k]||'#ccc'}" stroke-width="6" stroke-dasharray="${pct} ${100-pct}" stroke-dashoffset="${-offset}" transform="rotate(-90 21 21)"/>`;
    offset += pct;
  });
  svg.innerHTML = circles + `<text x="21" y="19" text-anchor="middle" font-size="7" font-weight="800" fill="#1B2340">${total}</text><text x="21" y="26" text-anchor="middle" font-size="3.6" fill="#8A93A6">${LANG==='zh'?'笔':'orders'}</text>`;
  document.getElementById('donutLegend').innerHTML = entries.map(([k,v])=>`<div class="legend-item"><span class="dot" style="background:${colors[k]||'#ccc'}"></span>${t('type.'+k)}&nbsp;<b>${v}</b></div>`).join('');
}

function groupCount(arr, field, labelFn){
  const m = {};
  arr.forEach(x=>{ const k = x[field]||'other'; m[k]=(m[k]||0)+1; });
  return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[labelFn?labelFn(k):k, v]);
}
/* Short money label for chart columns: ₩1.68M / ₩520K / ₩9,000 (full amount on hover) */
function fmtWonShort(n){
  n = Math.round(Number(n)||0);
  if(Math.abs(n)>=1e6) return '₩'+(n/1e6).toFixed(n>=1e7?1:2).replace(/\.?0+$/,'')+'M';
  if(Math.abs(n)>=1e4) return '₩'+Math.round(n/1e3)+'K';
  return fmtWon(n);
}
/* Vertical column chart. cols = [{label, total, segments:[{v, color, name}], current}] —
   one segment = simple columns, several = stacked (bottom first). */
function renderColumnChart(elId, cols, opts){
  const el = document.getElementById(elId); if(!el) return;
  const max = Math.max(1, ...cols.map(c=>c.total));
  const legend = (opts && opts.legend) ? `<div class="cc-legend">${opts.legend.map(l=>`<span><i style="background:${l.color}"></i>${escapeHtml(l.name)}</span>`).join('')}</div>` : '';
  el.innerHTML = `<div class="colchart" style="--cols:${cols.length}">${cols.map(c=>{
    const h = c.total ? Math.max(2, c.total/max*100) : 0;
    const tip = c.segments.length>1 ? c.segments.map(sg=>`${sg.name}: ${fmtWon(sg.v)}`).join('\n')+`\n= ${fmtWon(c.total)}` : fmtWon(c.total);
    return `<div class="cc-col${c.current?' current':''}" title="${escapeHtml(c.label+'\n'+tip)}">
      <div class="cc-val">${c.total?fmtWonShort(c.total):'—'}</div>
      <div class="cc-track"><div class="cc-bar" style="height:${h}%">${c.segments.filter(sg=>sg.v>0).map(sg=>`<div class="cc-seg" style="flex:${sg.v};background:${sg.color}"></div>`).join('')}</div></div>
      <div class="cc-lbl">${escapeHtml(c.label)}</div>
    </div>`;}).join('')}</div>${legend}`;
}
function shortMonthLabel(m){
  const [y,mo] = m.split('-');
  return LANG==='zh' ? `${String(y).slice(2)}年${Number(mo)}月` : new Date(Number(y),Number(mo)-1,1).toLocaleDateString('en-US',{month:'short', year:'2-digit'});
}
function renderBarChart(elId, pairs, valFmt){
  const el = document.getElementById(elId);
  const max = Math.max(1, ...pairs.map(p=>p[1]));
  el.innerHTML = pairs.length ? pairs.map(([label,val])=>`
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(val/max*100)}%"></div></div>
      <div class="bar-val">${valFmt?valFmt(val):val}</div>
    </div>`).join('') : `<div class="muted">—</div>`;
}

function bindRowOpens(){
  document.querySelectorAll('[data-open-customer]').forEach(el=>{
    el.addEventListener('click', ()=>{ const id = el.getAttribute('data-open-customer'); if(id) openCustomerDetail(id); });
  });
  document.querySelectorAll('[data-nav]').forEach(el=>{
    el.addEventListener('click', ()=> goTo(el.getAttribute('data-nav')));
  });
}

/* ---------------- CUSTOMERS ---------------- */
let custTypeTab = 'all';
/* the postpaid service used to measure "how long has this customer been active" —
   prefers an active postpaid service, falls back to the most recent one either way */
function postpaidServiceFor(customerId){
  const svcs = customerServices(customerId).filter(s=>s.type==='postpaid');
  if(!svcs.length) return null;
  return svcs.find(s=>s.isActive) || [...svcs].sort((a,b)=> new Date(b.activationDate||0)-new Date(a.activationDate||0))[0];
}
/* Groups customers that share the same name and/or phone number (the same criteria used
   when merge-importing), so the store can spot and clean up accidental duplicates.
   Uses union-find so e.g. A↔B sharing a name and B↔C sharing a phone all land in one group. */
function getDuplicateGroups(){
  const customers = DB.customers;
  const parent = {};
  const find = x => { while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; };
  const union = (a,b) => { const ra=find(a), rb=find(b); if(ra!==rb) parent[ra]=rb; };
  customers.forEach(c=> parent[c.id]=c.id);
  const byName = {}, byPhone = {};
  customers.forEach(c=>{
    const nameKey = (c.name||'').trim().toLowerCase();
    if(nameKey){ if(byName[nameKey]!=null) union(c.id, byName[nameKey]); else byName[nameKey]=c.id; }
    const phoneKey = (c.phone||'').replace(/[^0-9]/g,'');
    if(phoneKey){ if(byPhone[phoneKey]!=null) union(c.id, byPhone[phoneKey]); else byPhone[phoneKey]=c.id; }
  });
  const groups = {};
  customers.forEach(c=>{ const root = find(c.id); (groups[root] = groups[root]||[]).push(c); });
  return Object.values(groups).filter(g=>g.length>1).sort((a,b)=> a[0].name.localeCompare(b[0].name));
}
/* ---------------- DUPLICATE WARNING WHILE TYPING ----------------
   On the customer forms, typing a phone number or ID number that already belongs to
   another customer shows a warning under that field, with that customer's name, current
   plan and an "Open" button. It does NOT block saving (a returning customer, a shared
   family number…), but saving asks once to confirm. Phone numbers are compared by digits
   only and also against existing SIM numbers; ID numbers ignoring dashes and spaces. */
function dupePhoneKey(v){ const d = String(v||'').replace(/[^0-9]/g,''); return d.length>=9 ? d : ''; }
function dupeIdKey(v){ const k = String(v||'').toUpperCase().replace(/[^0-9A-Z]/g,''); return k.length>=6 ? k : ''; }
function findExistingMatches(kind, value, excludeId){
  const key = kind==='phone' ? dupePhoneKey(value) : dupeIdKey(value);
  if(!key) return [];
  const hits = new Map();
  DB.customers.forEach(c=>{
    if(c.id===excludeId) return;
    if(kind==='phone' ? dupePhoneKey(c.phone)===key : dupeIdKey(c.idNumber)===key) hits.set(c.id, c);
  });
  if(kind==='phone') DB.services.forEach(sv=>{
    if(sv.customerId===excludeId || dupePhoneKey(sv.number)!==key) return;
    const c = getCustomer(sv.customerId); if(c) hits.set(c.id, c);
  });
  return [...hits.values()];
}
// [input id, what it holds, which form]
const DUPE_WATCH = [['f_phone','phone','cust'], ['f_idNumber','id','cust'], ['pc_number','phone','pc'], ['pc_idNumber','id','pc']];
function dupeExcludeId(form){ return form==='cust' ? (editingCustomerId||null) : null; }
function dupePlanText(c){
  const sv = activeSubscriptionFor(c.id);
  if(!sv) return LANG==='zh' ? '无当前套餐' : 'no current plan';
  const kind = sv.type==='postpaid' ? (LANG==='zh'?'后付':'Postpaid') : (LANG==='zh'?'预付':'Prepaid');
  return `${kind}${sv.plan?' '+sv.plan:''}${sv.expiryDate?(LANG==='zh'?' · 到期 ':' · ends ')+sv.expiryDate:''}`;
}
function renderDupeWarning(inputId, kind, form){
  const input = document.getElementById(inputId); if(!input) return;
  const field = input.closest('.form-field') || input.parentElement;
  let box = field.querySelector(':scope > .dupe-warn');
  const matches = findExistingMatches(kind, input.value, dupeExcludeId(form));
  if(!matches.length){ if(box) box.remove(); return; }
  if(!box){ box = document.createElement('div'); box.className = 'dupe-warn'; field.appendChild(box); }
  const zh = LANG==='zh';
  const title = kind==='phone' ? (zh?'这个电话号码已在系统中':'This phone number is already in the CRM') : (zh?'这个证件号码已在系统中':'This ID number is already in the CRM');
  box.innerHTML = `<div class="dupe-warn-title">⚠ ${title}</div>` + matches.slice(0,3).map(c=>
    `<div class="dupe-warn-row"><span><b>${escapeHtml(c.name)}</b>${c.phone?' · '+escapeHtml(c.phone):''} · ${escapeHtml(dupePlanText(c))}</span>`+
    `<button type="button" class="btn btn-sm btn-ghost" data-dupe-open="${escapeHtml(c.id)}">${zh?'查看':'Open'}</button></div>`).join('') +
    (matches.length>3 ? `<div class="dupe-warn-row">+${matches.length-3} ${zh?'位':'more'}</div>` : '');
}
function clearDupeWarnings(){ document.querySelectorAll('.dupe-warn').forEach(b=>b.remove()); }
let dupeTimer = null;
document.addEventListener('input', e=>{
  const w = DUPE_WATCH.find(x=>x[0]===e.target.id); if(!w) return;
  clearTimeout(dupeTimer); dupeTimer = setTimeout(()=> renderDupeWarning(w[0], w[1], w[2]), 200);
});
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-dupe-open]'); if(!b) return;
  e.preventDefault();
  if(!confirm(LANG==='zh' ? '离开这个表单并打开现有客户？未保存的内容会丢失。' : 'Leave this form and open the existing customer? What you typed here will not be saved.')) return;
  const id = b.dataset.dupeOpen;
  closeAllModals(); openCustomerDetail(id);
});
/* Called by the save buttons. Returns true when it's OK to save: no matches, or the user
   confirmed saving anyway. */
function confirmNoDuplicates(form){
  const lines = [];
  DUPE_WATCH.filter(w=>w[2]===form).forEach(([id, kind])=>{
    const el = document.getElementById(id); if(!el) return;
    findExistingMatches(kind, el.value, dupeExcludeId(form)).slice(0,3).forEach(c=>{
      lines.push(`${kind==='phone'?(LANG==='zh'?'电话':'Phone'):(LANG==='zh'?'证件号码':'ID number')} ${el.value.trim()} → ${c.name}`);
    });
  });
  if(!lines.length) return true;
  return confirm((LANG==='zh' ? '以下信息已属于其他客户：\n\n' : 'Already used by another customer:\n\n') + [...new Set(lines)].join('\n') + (LANG==='zh' ? '\n\n仍然保存？' : '\n\nSave anyway?'));
}
/* ---------------- AI BUSINESS INTELLIGENCE PAGE ---------------- */
const AI_PRIORITY_PILL = {high:'pill-red', medium:'pill-orange', low:'pill-blue', none:'pill-gray'};
const AI_PRIORITY_ICON = {high:'🔥', medium:'🟠', low:'🟢', none:'⚪'};
function renderAIPage(){
  renderAIStayCards();
  if(window.renderNatStay) renderNatStay();
}
let aiStayExpanded = null; // which of the 3 categories is currently expanded below
let aiStaySignupMonth = 'all';
let aiStayMissingExpanded = false;
function renderAIStayMissingDataBanner(){
  const box = document.getElementById('aiStayMissingDataBanner');
  const diag = getStayBasedDiagnostics();
  if(diag.total===0){ box.style.display='none'; return; }
  box.style.display = '';
  const groups = [
    {list:diag.missingBoth, label:t('ai.stay.missing.both')},
    {list:diag.missingIdTypeOnly, label:t('ai.stay.missing.idType')},
    {list:diag.missingYearsOnly, label:t('ai.stay.missing.years')},
    {list:diag.noDobOnExpiredPlan, label:t('ai.stay.missing.dob')},
  ].filter(g=>g.list.length);
  box.innerHTML = `<div class="service-card" style="background:#FFFBEB;border-color:#FDE68A;margin-bottom:18px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;" data-missing-toggle>
      <div>⚠️ <b>${diag.total}</b> ${t('ai.stay.missing.summary')}</div>
      <span class="pill pill-orange">${aiStayMissingExpanded ? t('btn.hide') : t('btn.show')}</span>
    </div>
    ${aiStayMissingExpanded ? `<div style="margin-top:12px;">
      ${groups.map(g=>`
        <div style="margin-bottom:10px;">
          <div class="muted" style="font-size:12px;font-weight:700;margin-bottom:4px;">${g.label} (${g.list.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${g.list.map(c=>`<span class="pill pill-gray" style="cursor:pointer;" data-open-customer="${c.id}">${escapeHtml(c.name)}</span>`).join('')}
          </div>
        </div>`).join('')}
    </div>` : ''}
  </div>`;
  document.querySelector('[data-missing-toggle]')?.addEventListener('click', ()=>{
    aiStayMissingExpanded = !aiStayMissingExpanded;
    renderAIStayMissingDataBanner();
  });
  bindRowOpens();
}
function renderAIStayCards(){
  const {readyForPostpaid, prepaidRecharge, postpaidUpgrade, finishedNeedsRecharge} = getStayBasedOpportunities();
  const cats = [
    {key:'readyForPostpaid', icon:'✓', list:readyForPostpaid, color:'#16A34A', grad:'linear-gradient(135deg,#ECFDF5,#D1FAE5)'},
    {key:'prepaidRecharge', icon:'↻', list:prepaidRecharge, color:'#2563EB', grad:'linear-gradient(135deg,#EFF6FF,#DBEAFE)'},
    {key:'finishedNeedsRecharge', icon:'✉', list:finishedNeedsRecharge, color:'#EA580C', grad:'linear-gradient(135deg,#FFF7ED,#FFEDD5)'},
    {key:'postpaidUpgrade', icon:'★', list:postpaidUpgrade, color:'#8B5CF6', grad:'linear-gradient(135deg,#F5F3FF,#EDE9FE)'},
  ];
  renderAIStayMissingDataBanner();
  document.getElementById('aiStayCards').innerHTML = cats.map(cat=>{
    const selected = aiStayExpanded===cat.key;
    return `<div class="ai-stay-card ${selected?'selected':''}" style="background:${cat.list.length?cat.grad:'var(--card)'};--accent:${cat.color};" data-stay-card="${cat.key}">
      <div class="ai-stay-card-icon" style="color:${cat.color};">${cat.icon}</div>
      <div class="ai-stay-card-label">${t('ai.stay.'+cat.key)}</div>
      <div class="ai-stay-card-value">${cat.list.length}</div>
      <div class="ai-stay-card-action">${t('ai.stay.'+cat.key+'Action')} →</div>
    </div>`;
  }).join('');
  document.querySelectorAll('[data-stay-card]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const key = el.dataset.stayCard;
      aiStayExpanded = aiStayExpanded===key ? null : key;
      aiStaySignupMonth = 'all'; // reset the filter whenever switching categories, so it never silently hides everything in a newly-opened list
      renderAIStayCards(); // re-render so the clicked card's selected state updates too
    });
  });
  document.getElementById('aiStayListClose').onclick = ()=>{ aiStayExpanded=null; renderAIStayCards(); };
  renderAIStayExpandedList(cats);
}
function renderAIStayExpandedList(cats){
  const listCard = document.getElementById('aiStayListCard');
  if(!aiStayExpanded){ listCard.style.display='none'; return; }
  listCard.style.display = '';
  const cat = cats.find(c=>c.key===aiStayExpanded);
  document.getElementById('aiStayListTitle').textContent = `${cat.icon} ${t('ai.stay.'+cat.key)} (${cat.list.length})`;
  document.getElementById('aiStayListDesc').textContent = t('ai.stay.'+cat.key+'Desc');

  // Signup-month filter — pulls from EVERY prepaid signup ever made, not just the months
  // that happen to have a match in this category right now, so every month is always
  // selectable even if it currently shows zero for this particular list.
  const monthsPresent = [...new Set(DB.services.filter(s=>s.type==='prepaid' && s.activationDate).map(s=>s.activationDate.slice(0,7)))].sort().reverse();
  const monthSel = document.getElementById('aiStaySignupMonth');
  monthSel.innerHTML = `<option value="all">${t('rep.allTime')}</option>` + monthsPresent.map(m=>`<option value="${m}">${fmtMonthLabel(m)}</option>`).join('');
  monthSel.value = aiStaySignupMonth;
  monthSel.onchange = ()=>{ aiStaySignupMonth = monthSel.value; renderAIStayExpandedList(cats); };

  const filtered = aiStaySignupMonth==='all' ? cat.list : cat.list.filter(x=> x.service.activationDate && x.service.activationDate.slice(0,7)===aiStaySignupMonth);

  const box = document.getElementById('aiStayExpandedList');
  // Sort most-urgent first: already-finished plans furthest in the past, then soonest to
  // expire — so the person someone should call FIRST is always at the top of the list.
  // Underage entries (no real "days" of their own) sort to the end, ordered by how soon
  // they'll turn 19, since they're a heads-up rather than an action to take right now.
  const withDays = filtered.map(x=>{
    const days = x.service.expiryDate ? daysBetween(todayISO(), x.service.expiryDate) : null;
    return {...x, days};
  }).sort((a,b)=>{
    if(a.subStatus==='underage' && b.subStatus!=='underage') return 1;
    if(b.subStatus==='underage' && a.subStatus!=='underage') return -1;
    if(a.subStatus==='underage' && b.subStatus==='underage') return (a.daysUntil19??999)-(b.daysUntil19??999);
    return (a.days??0) - (b.days??0);
  });

  box.innerHTML = withDays.length ? withDays.map(({customer:c, service:svc, days, subStatus, daysUntil19, remainingStayYears})=>{
    let dayLabel, dayPillClass;
    if(subStatus==='underage'){
      dayLabel = daysUntil19===null ? '' : (LANG==='zh' ? `还差 ${daysUntil19} 天满19岁` : `${daysUntil19}d until 19`);
      dayPillClass = 'pill-gray';
    } else if(days===null){ dayLabel = ''; dayPillClass = 'pill-gray'; }
    else if(days<0){ dayLabel = LANG==='zh' ? `${Math.abs(days)} 天前已结束` : `Finished ${Math.abs(days)}d ago`; dayPillClass = 'pill-red'; }
    else if(days===0){ dayLabel = LANG==='zh' ? '今天到期' : 'Due today'; dayPillClass = 'pill-red'; }
    else { dayLabel = LANG==='zh' ? `还剩 ${days} 天` : `${days}d left`; dayPillClass = days<=7 ? 'pill-orange' : 'pill-gray'; }
    // Underage entries can still have their current prepaid plan running or already
    // finished — shown as a second, separate indicator from the age countdown, since
    // both are useful to know at a glance: whether they're mid-contract right now, AND
    // how long until they're even old enough for postpaid to be worth bringing up.
    let planLabel = '', planPillClass = '';
    if(subStatus==='underage' && days!==null){
      if(days>0){ planLabel = LANG==='zh' ? `合约中 · 还剩${days}天` : `In contract · ${days}d left`; planPillClass = 'pill-blue'; }
      else { planLabel = LANG==='zh' ? '套餐已结束' : 'Plan finished'; planPillClass = 'pill-gray'; }
    }
    // Shows the actual worked-out remaining stay (already decayed from whatever was
    // originally stated, down to what's left as of today) rather than just the raw
    // "Years in Korea" value — so it's visible AT A GLANCE why someone qualifies, without
    // needing to check their signup date and do the subtraction by hand.
    const remainingStayNote = (subStatus==='eligible' && remainingStayYears!=null)
      ? (LANG==='zh' ? `预计还剩 ${(remainingStayYears*12).toFixed(1)} 个月在韩` : `~${(remainingStayYears*12).toFixed(1)}mo stay left`)
      : (cat.key==='finishedNeedsRecharge' && remainingStayYears!=null)
      ? (LANG==='zh' ? `预计还剩 ${(remainingStayYears*12).toFixed(1)} 个月在韩` : `~${(remainingStayYears*12).toFixed(1)}mo stay left`)
      : '';
    const smsButtons = (cat.key==='finishedNeedsRecharge' && c.phone) ? `
      <a class="btn btn-sm btn-ghost" href="sms:${c.phone.replace(/[^0-9+]/g,'')}?body=${encodeURIComponent(buildRechargeSmsText(c, remainingStayYears))}" style="flex:0 0 auto;text-decoration:none;">📱 ${t('btn.openSms')}</a>
      <button class="btn btn-sm btn-ghost" data-copy-sms="${c.id}" data-recharge-months="${remainingStayYears!=null?Math.max(1,Math.round(remainingStayYears*12)):1}" style="flex:0 0 auto;">📋 ${t('btn.copySms')}</button>` : '';
    return `<div class="ai-stay-row" style="--accent:${cat.color};${subStatus==='underage'?'opacity:.8;':''}">
      <span class="avatar">${initials(c.name)}</span>
      <div style="min-width:0;flex:1;">
        <div style="font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;flex-wrap:wrap;" data-open-customer="${c.id}">
          ${escapeHtml(c.name)}
          <button class="copy-name-btn" data-copy-name="${c.id}" title="${t('btn.copyName')}">📋</button>
          <span class="pill pill-blue" style="margin-left:2px;">${escapeHtml(c.nationality||'')}</span>
          ${subStatus==='underage' ? `<span class="pill pill-gray">${t('ai.stay.underage')}</span>` : ''}
          ${planLabel ? `<span class="pill ${planPillClass}">${planLabel}</span>` : ''}
        </div>
        <div class="muted" style="font-size:12px;">${escapeHtml(svc.plan||'')} · ${escapeHtml(c.phone||'—')} · ${LANG==='zh'?'到期':'expiry'} ${fmtDate(svc.expiryDate)}${remainingStayNote?` · ${remainingStayNote}`:''}</div>
      </div>
      ${smsButtons}
      ${dayLabel ? `<span class="pill ${dayPillClass}" style="flex:0 0 auto;font-weight:700;">${dayLabel}</span>` : ''}
    </div>`;
  }).join('') : emptyState();
  bindRowOpens();
  box.querySelectorAll('[data-copy-name]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      copyCustomerNameToClipboard(btn.getAttribute('data-copy-name'), btn);
    });
  });
  box.querySelectorAll('[data-copy-sms]').forEach(btn=>{
    btn.addEventListener('click', async e=>{
      e.stopPropagation();
      const cust = getCustomer(btn.getAttribute('data-copy-sms'));
      const months = Number(btn.getAttribute('data-recharge-months'))||1;
      try{
        await navigator.clipboard.writeText(buildRechargeSmsText(cust, months/12));
        toast(t('toast.smsCopied'));
      }catch(err){ toast(LANG==='zh'?'复制失败':'Copy failed'); }
    });
  });
  box.querySelectorAll('a[href^="sms:"]').forEach(a=>{
    a.addEventListener('click', e=> e.stopPropagation());
  });
}
/* Builds the recharge-reminder SMS text for a customer whose prepaid plan has finished but
   who isn't eligible for postpaid yet (under 19, or not staying long enough) — the only
   real move left for them is recharging for whatever time they have left. Kept in English
   since that's broadly understandable across this store's international customer base. */
function buildRechargeSmsText(c, remainingStayYears){
  const monthsLeft = remainingStayYears!=null ? Math.max(1, Math.round(remainingStayYears*12)) : 1;
  return `Hi ${c.name}, this is 365 Hi Mobile. Your prepaid plan has ended. You can recharge for about ${monthsLeft} more month${monthsLeft>1?'s':''} to keep your number active. Please visit us or reply to renew. Thank you!`;
}
function renderCustomers(){
  populateStaticSelects();
  const search = (document.getElementById('custSearch').value||'').toLowerCase();
  const natFilter = document.getElementById('custNationalityFilter').value;
  const sortBy = document.getElementById('custSortBy').value;
  const durFilter = document.getElementById('custDurationFilter').value;
  const recentFilter = document.getElementById('custRecentFilter').value;
  const sortComparators = {
    newest: (a,b)=> new Date(customerJoinDate(b)||0)-new Date(customerJoinDate(a)||0),
    oldest: (a,b)=> new Date(customerJoinDate(a)||0)-new Date(customerJoinDate(b)||0),
    nameAsc: (a,b)=> a.name.localeCompare(b.name),
    nameDesc: (a,b)=> b.name.localeCompare(a.name),
    ratingHigh: (a,b)=> (b.rating||0)-(a.rating||0),
    ratingLow: (a,b)=> (a.rating||0)-(b.rating||0),
  };
  const sortFn = sortComparators[sortBy] || sortComparators.newest;

  const allCusts = DB.customers;
  const dupeGroupsRaw = getDuplicateGroups();
  // each group sorted newest member first, and groups themselves ordered by their newest
  // member — this is also what "merge into newest" targets, so the row showing the Merge
  // button is always the one everything else in the group gets folded into
  const dupeGroups = dupeGroupsRaw.map(g=>[...g].sort((a,b)=> new Date(customerJoinDate(b)||0)-new Date(customerJoinDate(a)||0)))
    .sort((a,b)=> new Date(customerJoinDate(b[0])||0)-new Date(customerJoinDate(a[0])||0));
  const dupeCount = dupeGroups.reduce((n,g)=>n+g.length,0);
  const inactiveCount = allCusts.filter(c=>!activeSubscriptionFor(c.id)).length;
  const tabs = [
    {key:'all', label:'custtab.all', n:allCusts.length},
    {key:'prepaid', label:'custtab.prepaid', n:allCusts.filter(c=>(c.subType||'prepaid')==='prepaid').length},
    {key:'postpaid', label:'custtab.postpaid', n:allCusts.filter(c=>c.subType==='postpaid').length},
    {key:'inactive', label:'custtab.inactive', n:inactiveCount},
    {key:'dupes', label:'custtab.dupes', n:dupeCount},
  ];
  document.getElementById('custTypeTabs').innerHTML = tabs.map(tb=>`<button class="chip-tab ${custTypeTab===tb.key?'active':''} ${tb.key==='dupes'&&tb.n?'chip-tab-warn':''}" data-custtab="${tb.key}">${t(tb.label)} <span class="n">${tb.n}</span></button>`).join('');
  document.querySelectorAll('[data-custtab]').forEach(b=> b.addEventListener('click', ()=>{ custTypeTab=b.dataset.custtab; renderCustomers(); }));

  // the "how long active" filter and column only make sense for postpaid customers
  const showDuration = custTypeTab==='postpaid';
  document.getElementById('custDurationFilter').style.display = showDuration ? '' : 'none';
  document.getElementById('colActiveFor').style.display = showDuration ? '' : 'none';
  if(!showDuration) document.getElementById('custDurationFilter').value = '';

  const isDupeView = custTypeTab==='dupes';
  document.getElementById('colDupeReason').style.display = isDupeView ? '' : 'none';

  // group-index lookup so duplicate rows can be visually banded together
  const groupIndexById = {};
  if(isDupeView) dupeGroups.forEach((g,i)=> g.forEach(c=> groupIndexById[c.id]=i));

  let list;
  if(isDupeView){
    list = dupeGroups.flat().filter(c=>{
      if(natFilter && c.nationality!==natFilter) return false;
      if(recentFilter){ const jd=customerJoinDate(c); if(!jd || daysBetween(jd, todayISO())>Number(recentFilter)) return false; }
      if(search){
        const hay = [c.name,c.phone,c.nationality,c.idNumber].join(' ').toLowerCase();
        if(!hay.includes(search)) return false;
      }
      return true;
    });
  } else {
    list = DB.customers.filter(c=>{
      if(custTypeTab==='prepaid' && (c.subType||'prepaid')!=='prepaid') return false;
      if(custTypeTab==='postpaid' && c.subType!=='postpaid') return false;
      if(custTypeTab==='inactive' && activeSubscriptionFor(c.id)) return false;
      if(natFilter && c.nationality!==natFilter) return false;
      if(recentFilter){ const jd=customerJoinDate(c); if(!jd || daysBetween(jd, todayISO())>Number(recentFilter)) return false; }
      if(durFilter){
        const svc = postpaidServiceFor(c.id);
        const months = svc ? monthsSince(svc.activationDate) : null;
        if(months===null || months < Number(durFilter)) return false;
      }
      if(search){
        const hay = [c.name,c.phone,c.nationality,c.idNumber].join(' ').toLowerCase();
        if(!hay.includes(search)) return false;
      }
      return true;
    })
    // sorted per the "Sort by" dropdown — defaults to newest first
    .sort(sortFn);
  }
  document.getElementById('custCount').textContent = isDupeView
    ? `${dupeGroups.length} ${LANG==='zh'?'组重复 · 共':'duplicate groups · '} ${dupeCount} ${LANG==='zh'?'位客户 · 按姓名或电话匹配':'customers involved · matched by name or phone'}`
    : `${list.length} ${LANG==='zh'?'位客户 · 一个客户可关联多项业务':'customers · each can have multiple services'}`;
  document.getElementById('customersBody').innerHTML = list.length ? list.map(c=>{
    const svcs = customerServices(c.id);
    const active = activeSubscriptionFor(c.id);
    const recent = [...svcs].sort((a,b)=> new Date(b.activationDate||0)-new Date(a.activationDate||0))[0];
    const postpaidSvc = showDuration ? postpaidServiceFor(c.id) : null;
    const months = postpaidSvc ? monthsSince(postpaidSvc.activationDate) : null;
    const durTxt = months===null ? '—' : (LANG==='zh' ? `${months} 个月` : `${months} ${months===1?'month':'months'}`);
    const groupBand = isDupeView ? (groupIndexById[c.id]%2===0 ? 'dupe-band-a' : 'dupe-band-b') : '';
    let dupeReasonCell = '';
    let isNewestInGroup = false;
    if(isDupeView){
      const group = dupeGroups[groupIndexById[c.id]];
      isNewestInGroup = group[0].id === c.id;
      const sameName = group.filter(x=>x.id!==c.id).some(x=>x.name.trim().toLowerCase()===c.name.trim().toLowerCase());
      const samePhone = c.phone && group.filter(x=>x.id!==c.id).some(x=>x.phone===c.phone);
      const reasons = [sameName?t('dupe.reasonName'):null, samePhone?t('dupe.reasonPhone'):null].filter(Boolean).join(' + ');
      dupeReasonCell = `<td><span class="pill pill-red">${reasons||t('dupe.reasonName')}</span></td>`;
    }
    const subBadge = active
      ? `<span class="pill ${active.type==='postpaid'?'pill-blue':'pill-orange'}">${active.type==='postpaid'?t('opt.postpaidShort'):t('opt.prepaidShort')}</span>`
      : `<span class="pill pill-gray">${t('detail.noActiveSubscription')}</span>`;
    let statusCell = '<span class="muted">—</span>';
    if(active && active.expiryDate){
      const remainingDays = daysBetween(todayISO(), active.expiryDate);
      const color = remainingDays<0 ? 'var(--red)' : (remainingDays<=7 ? 'var(--orange)' : 'var(--green)');
      statusCell = `<span style="color:${color};font-weight:700;font-size:12px;">${contractStatusTextFor(active, true)}</span>`;
    } else if(!active && recent){
      // no active subscription — show why/when their last plan ended, so the Inactive tab
      // is actually informative instead of just a blank dash
      const reasonTxt = recent.changeReason==='cancelled' ? t('reason.cancelled') : (LANG==='zh'?'未续约':'Not renewed');
      const endedOn = recent.endedAt || recent.expiryDate;
      const daysAgo = endedOn ? daysBetween(endedOn, todayISO()) : null;
      statusCell = `<span style="color:var(--red);font-weight:700;font-size:12px;">${reasonTxt}${daysAgo!==null && daysAgo>=0 ? (LANG==='zh'?` · ${daysAgo}天前`:` · ${daysAgo}d ago`) : ''}</span>`;
    }
    return `<tr class="row-click ${groupBand}" data-open-customer="${c.id}">
      <td class="name-cell" title="${escapeHtml(c.name)}"><span class="avatar">${initials(c.name)}</span><span class="name-text">${escapeHtml(c.name)}</span></td>
      <td>${escapeHtml((active&&active.number)||c.phone||'—')}</td>
      <td><span class="cell-ellipsis">${escapeHtml(c.nationality)}</span></td>
      <td>${(c.idType?t('idtype.'+c.idType):'—')}</td>
      <td>${subBadge}</td>
      <td>${statusCell}</td>
      <td>${recent? t('type.'+recent.type) : '—'}</td>
      <td class="nowrap">${fmtDate(customerJoinDate(c))}</td>
      ${showDuration ? `<td>${durTxt}</td>` : ''}
      ${isDupeView ? dupeReasonCell : ''}
      <td>${'★'.repeat(c.rating||0)}<span style="color:#DADEEA">${'★'.repeat(5-(c.rating||0))}</span></td>
      <td style="white-space:nowrap;">${isNewestInGroup ? `<button class="btn btn-sm btn-primary" data-merge-group="${groupIndexById[c.id]}" title="${LANG==='zh'?'将本组其他重复客户合并到这条最新记录中':'Merge the other duplicates in this group into this newest record'}">🔀 ${t('btn.merge')}</button> ` : ''}<button class="btn btn-sm btn-ghost" data-open-customer="${c.id}">${t('btn.view')}</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="10">${isDupeView ? emptyStateDupes() : emptyState()}</td></tr>`;
  bindRowOpens();
  document.querySelectorAll('[data-merge-group]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const group = dupeGroups[Number(btn.dataset.mergeGroup)];
      if(!group || group.length<2) return;
      const [primary, ...others] = group;
      const otherNames = others.map(c=>c.name).join(', ');
      const msg = LANG==='zh'
        ? `将「${otherNames}」的所有业务记录合并到「${primary.name}」（最新记录）中，其余重复客户档案将被删除，仅保留一个客户档案，历史套餐可在该客户资料中查看。是否继续？`
        : `This will move all service records from "${otherNames}" into "${primary.name}" (the newest record), then delete the other duplicate profiles — leaving just one customer with everything visible in their Plan History. Continue?`;
      if(!confirm(msg)) return;
      mergeDuplicateGroup(group.map(c=>c.id));
      toast(LANG==='zh' ? '已合并重复客户' : 'Duplicate customers merged');
      renderCustomers();
      renderNav();
    });
  });
}
/* Folds every OTHER customer in a duplicate group into the first one (the group's newest
   record) — moves all their service records over as history, fills any blank profile fields
   on the primary from the others so nothing is lost, then deletes the redundant profiles. */
function mergeDuplicateGroup(customerIds){
  const primaryId = customerIds[0];
  const primary = getCustomer(primaryId);
  if(!primary) return;
  const others = customerIds.slice(1);
  const fillGapFields = ['idNumber','idType','idExpiry','dob','nationality','occupation','years','address','notes','workType','handlerName','referralFriendName','branchOffice','carrierType','planType','phone'];
  others.forEach(otherId=>{
    const otherCust = getCustomer(otherId);
    if(!otherCust) return;
    fillGapFields.forEach(f=>{
      if((primary[f]===undefined || primary[f]==='' || primary[f]===null) && otherCust[f]) primary[f] = otherCust[f];
    });
    DB.services.filter(s=>s.customerId===otherId).forEach(s=>{ s.customerId = primaryId; });
    DB.customers = DB.customers.filter(c=>c.id!==otherId);
    deleteCustomerOnServer(otherId);
  });
  // moving records over can leave the primary with more than one "active" subscription at
  // once (e.g. two of the merged duplicates each had their own active plan) — enforce the
  // one-active-subscription rule by keeping only the most recently activated as active and
  // folding the rest into history, exactly like every other subscription change does.
  // changeReason is force-overwritten (not just filled in if blank) because a demoted record
  // already carries whatever reason it was ORIGINALLY created with (e.g. "new") — leaving
  // that in place would mislabel it as a fresh signup instead of a merged duplicate.
  const activeSvcs = DB.services.filter(s=>s.customerId===primaryId && isSubscriptionType(s.type) && s.isActive);
  if(activeSvcs.length > 1){
    const winner = activeSvcs.reduce((a,b)=> new Date(b.activationDate||0) > new Date(a.activationDate||0) ? b : a);
    activeSvcs.forEach(s=>{
      if(s!==winner){ s.isActive=false; s.endedAt = s.endedAt||todayISO(); s.endedSeq = s.endedSeq||Date.now(); s.changeReason = 'merged'; }
    });
  }
  saveDB(DB);
}
function emptyStateDupes(){
  return `<div class="empty-state"><b>${LANG==='zh'?'没有发现重复客户 👍':'No duplicate customers found 👍'}</b>${LANG==='zh'?'按姓名或电话号码匹配，未发现重复记录':'Checked by matching name and phone number — nothing to clean up'}</div>`;
}

/* ---------------- NEW CUSTOMER: type chooser + dedicated postpaid form ---------------- */
document.getElementById('btnNewCustomerTop').addEventListener('click', ()=>{
  document.getElementById('newCustomerTypeModalOverlay').classList.add('show');
});
document.getElementById('chooseTypePrepaid').addEventListener('click', ()=>{
  closeAllModals();
  openCustomerModal(null);
});
document.getElementById('chooseTypePostpaid').addEventListener('click', ()=>{
  closeAllModals();
  openNewPostpaidModal();
});
function openNewPostpaidModal(){
  clearDupeWarnings();
  document.getElementById('pc_name').value = '';
  document.getElementById('pc_nationality').value = '';
  document.getElementById('pc_dob').value = '';
  document.getElementById('pc_years').value = '';
  document.getElementById('pc_idNumber').value = '';
  document.getElementById('pc_occupation').value = '';
  renderCompactOptionField('pc_idType_group', ['ARC','Passport'], 'ARC', t('f.idType'));
  renderCompactOptionField('pc_workType_group', POSTPAID_WORK_TYPES, '', t('f.workType'));
  renderCompactOptionField('pc_contractLength_group', POSTPAID_CONTRACT_DAYS.map(String), String(POSTPAID_CONTRACT_DAYS[0]), t('f.contractLength'));
  renderCompactOptionField('pc_company_group', POSTPAID_COMPANIES, '', t('f.company'));
  renderCompactOptionField('pc_partnerCompany_group', POSTPAID_PARTNER_COMPANIES, '', t('f.partnerCompany'));
  renderCompactOptionField('pc_svcCarrierType_group', POSTPAID_CARRIER_TYPES, '', t('f.svcCarrierType'));
  renderPostpaidPlanTiles('pc_plan_group', '');
  document.getElementById('pc_number').value = '';
  document.getElementById('pc_activationDate').value = todayISO();
  renderSimTypeTiles('pc_simType_group', 'physical');
  document.getElementById('pc_monthlyFee').value = '';
  renderTileRadioGroup('pc_handlerName_group', STAFF_MEMBERS, getActiveStaff());
  document.getElementById('pc_expectedProfit').value = '';
  document.getElementById('pc_usimFee').value = '';
  document.getElementById('pc_discountPerMonth').value = '';
  document.getElementById('pc_discountMonths').value = '';
  document.getElementById('pc_netExpectedPreview').value = '';
  document.getElementById('pc_referralFriend').value = '';
  document.getElementById('pc_notes').value = '';
  document.getElementById('newPostpaidModalOverlay').classList.add('show');
  if(window.refreshCustomerForms) refreshCustomerForms();
}
function updatePcNetExpectedPreview(){
  const expected = Number(document.getElementById('pc_expectedProfit').value)||0;
  const usimFee = Number(document.getElementById('pc_usimFee').value)||0;
  const perMonth = Number(document.getElementById('pc_discountPerMonth').value)||0;
  const months = Number(document.getElementById('pc_discountMonths').value)||0;
  document.getElementById('pc_netExpectedPreview').value = fmtWon(Math.max(0, expected - (perMonth*months) - usimFee));
}
['pc_expectedProfit','pc_usimFee','pc_discountPerMonth','pc_discountMonths'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updatePcNetExpectedPreview);
});
document.getElementById('savePostpaidCustomerBtn').addEventListener('click', ()=>{
  const name = document.getElementById('pc_name').value.trim();
  if(!name){ toast(LANG==='zh'?'请输入客户姓名':'Please enter a customer name'); return; }
  if(!confirmNoDuplicates('pc')) return;
  const workType = document.getElementById('pc_workType_group').dataset.selected;
  if(!workType){ toast(LANG==='zh'?'请选择「业务向」':'Please select a work type'); return; }
  const idType = document.getElementById('pc_idType_group').dataset.selected || 'ARC';
  const contractLength = Number(document.getElementById('pc_contractLength_group').dataset.selected || POSTPAID_CONTRACT_DAYS[0]);
  const company = document.getElementById('pc_company_group').dataset.selected || '';
  const partnerCompany = document.getElementById('pc_partnerCompany_group').dataset.selected || '';
  const svcCarrierType = document.getElementById('pc_svcCarrierType_group').dataset.selected || '';
  const referralFriendName = document.getElementById('pc_referralFriend').value.trim();

  const cust = {
    id: uid('c'), name,
    nationality: document.getElementById('pc_nationality').value.trim().toUpperCase() || 'OTHER',
    dob: document.getElementById('pc_dob').value,
    phone: document.getElementById('pc_number').value.trim(),
    idType, idNumber: document.getElementById('pc_idNumber').value.trim(), idExpiry:'',
    occupation: document.getElementById('pc_occupation').value.trim(),
    workplace:'', years: Number(document.getElementById('pc_years').value)||0,
    referral: referralFriendName ? 'friend' : 'other',
    referralFriendName,
    handlerName: document.getElementById('pc_handlerName_group').dataset.selected || '',
    workType,
    carrierType:'SKT', planType:'신규가입', branchOffice:'',
    subType:'postpaid', address:'', notes: document.getElementById('pc_notes').value.trim(),
    rating:3, createdAt: todayISO(),
  };
  DB.customers.push(cust);

  const activationDate = document.getElementById('pc_activationDate').value || todayISO();
  const d = new Date(activationDate); d.setDate(d.getDate()+contractLength);
  const svcData = {
    customerId: cust.id, type:'postpaid',
    carrier: svcCarrierType, plan: document.getElementById('pc_plan_group').dataset.selected || '',
    number: document.getElementById('pc_number').value.trim(),
    simType: document.getElementById('pc_simType_group').dataset.selected || 'physical', activationDate, durationDays: contractLength,
    expiryDate: d.toISOString().slice(0,10), status:'active',
    monthlyFee: Number(document.getElementById('pc_monthlyFee').value)||0,
    discount:0,
    // this business earns a one-time carrier commission per signup, not recurring monthly
    // revenue — expectedProfit ("Company Price") is the carrier's catalog/estimated payout
    // at signup; actualProfit ("Real Company Price") gets filled in later (via Sheet View)
    // once the carrier settles at month-end. Net income = that price − discount − USIM fee.
    expectedProfit: Number(document.getElementById('pc_expectedProfit').value)||0,
    actualProfit: 0,
    usimFee: Number(document.getElementById('pc_usimFee').value)||0,
    discountPerMonth: Number(document.getElementById('pc_discountPerMonth').value)||0,
    discountMonths: Number(document.getElementById('pc_discountMonths').value)||0,
    firstMonthPayment:0, activationFee:0, simFee:0,
    sellingPrice:0, cost:0, received:0, paymentMethod: '', commission:0, notes:document.getElementById('pc_notes').value.trim(),
    company, partnerCompany, svcCarrierType,
  };
  setActiveSubscription(cust.id, svcData, 'new');
  saveDB(DB);
  closeAllModals();
  toast(t('toast.customerSaved'));
  renderPage(currentPage);
  renderNav();
});

function openCustomerModal(customer){
  clearDupeWarnings();
  editingCustomerId = customer ? customer.id : null;
  document.getElementById('customerModalTitle').textContent = customer ? t('modal.editCustomer') : t('modal.newCustomer');
  populateStaticSelects();
  populateAddressSuggestions(customer?.address);
  document.getElementById('f_name').value = customer?.name || '';
  document.getElementById('f_phone').value = customer?.phone || '';
  document.getElementById('f_nationality').value = customer?.nationality || '';
  document.getElementById('f_dob').value = toYYMMDD(customer?.dob) || '';
  renderTileRadioGroup('f_idType_group', ['ARC','Passport'], customer?.idType || 'ARC');
  document.getElementById('f_idNumber').value = customer?.idNumber || '';
  document.getElementById('f_idExpiry').value = toYYMMDD(customer?.idExpiry) || '';
  updateIdExpiryHint();
  // Not needed at initial signup time — it's still useful data (AI eligibility checks,
  // data completeness), so it stays available on Edit Profile for filling in later, same
  // reasoning as Payment Method.
  document.getElementById('f_idExpiryField').style.display = editingCustomerId ? '' : 'none';
  // an existing customer's occupation might be old free-text that predates this option set —
  // only pre-select a tile if it actually matches one of the current choices
  renderTileRadioGroup('f_occupation_group', OCCUPATION_OPTIONS, OCCUPATION_OPTIONS.includes(customer?.occupation) ? customer.occupation : '');
  document.getElementById('f_years').value = customer?.years ?? '';
  // New customer → sensible defaults. Existing customer → exactly what's stored, even if
  // blank or an old value not in today's option list; previously Edit Profile silently
  // saved "SKT" / "Friend" / the current staff member over blanks and old values.
  if(customer){
    setSelectPreserving(document.getElementById('f_referral'), customer.referral || '');
    setSelectPreserving(document.getElementById('f_carrierType'), customer.carrierType || '');
    setSelectPreserving(document.getElementById('f_planType'), customer.planType || '');
    setSelectPreserving(document.getElementById('f_branchOffice'), customer.branchOffice || '');
    setSelectPreserving(document.getElementById('f_handlerName'), customer.handlerName || '');
  } else {
    document.getElementById('f_referral').value = 'friend';
    document.getElementById('f_carrierType').value = 'SKT';
    document.getElementById('f_planType').value = '신규가입';
    document.getElementById('f_branchOffice').value = 'KY0000489';
    document.getElementById('f_handlerName').value = getActiveStaff();
  }
  document.getElementById('f_address').value = customer?.address || '';
  document.getElementById('f_notes').value = customer?.notes || '';
  setRatingStars(customer ? (Number(customer.rating)||0) : 5);
  document.getElementById('p3_number').value = customer?.phone || '';
  document.getElementById('p3_activationDate').value = todayISO();
  document.getElementById('p3_usimNumber').value = '';
  document.getElementById('p3_discount').value = '0';
  renderPrepaidPlanTiles('90');
  updatePrepaidPriceFromPlan();
  renderSimTypeTiles('p3_simType_group', 'physical');
  renderTileRadioGroup('p3_paymentMethod_group', PAYMENT_METHODS, '');
  updateCurrencyBadgeFor('p3_paymentMethod_group');
  // Payment method only makes sense once there's actually something to record — a brand
  // new customer hasn't paid yet at the point their info is being entered, so asking for it
  // here just gets skipped or guessed at. It stays available on Edit Profile (and Sheet
  // View) for filling in later, once the payment has actually happened.
  document.getElementById('p3_paymentMethodField').style.display = editingCustomerId ? '' : 'none';
  // "Edit profile" should give full access to the customer's current plan too, not just
  // their basic identity fields — matching what creating a new customer already shows.
  // Editing updates their CURRENT service in place (no new history entry); this is
  // deliberately different from "Recharge" / "Change Plan", which create a fresh entry
  // because those represent an actual new transaction, not a correction.
  const isEditingPostpaid = !!(editingCustomerId && customer?.subType === 'postpaid');
  const isEditingPrepaid = !!(editingCustomerId && customer?.subType !== 'postpaid');
  const currentSvc = editingCustomerId ? activeSubscriptionFor(editingCustomerId) : null;
  document.getElementById('prepaid3mFields').style.display = isEditingPostpaid ? 'none' : '';
  document.getElementById('postpaidEditFields').style.display = isEditingPostpaid ? '' : 'none';
  document.getElementById('savePrintCustomerBtn').style.display = (isEditingPostpaid || editingCustomerId) ? 'none' : '';
  // when editing, "Save customer" alone (no print requirement) handles everything —
  // printing an application form doesn't make sense for a correction to an existing record
  if(isEditingPrepaid && currentSvc){
    renderPrepaidPlanTiles(String(currentSvc.durationDays||90), 'p3_prepaidPlan_group');
    document.getElementById('p3_price').value = currentSvc.price ?? '';
    document.getElementById('p3_discount').value = currentSvc.discount ?? 0;
    document.getElementById('p3_usimNumber').value = currentSvc.usimNumber || '';
    document.getElementById('p3_activationDate').value = currentSvc.activationDate || todayISO();
    renderSimTypeTiles('p3_simType_group', currentSvc.simType || 'physical');
    updateP3FinalPricePreview();
    const {companies, carriers} = prepaidCompanyCarrierOptionsFor(currentSvc.durationDays||90);
    renderTileRadioGroup('p3_company_group', companies, companies.includes(currentSvc.company) ? currentSvc.company : '');
    renderTileRadioGroup('p3_svcCarrierType_group', carriers, carriers.includes(currentSvc.svcCarrierType) ? currentSvc.svcCarrierType : '');
    renderTileRadioGroup('p3_paymentMethod_group', PAYMENT_METHODS, PAYMENT_METHODS.includes(currentSvc.paymentMethod) ? currentSvc.paymentMethod : '');
    updateCurrencyBadgeFor('p3_paymentMethod_group');
    document.getElementById('prepaid3mHint').textContent = t('prepaid3m.editHint');
  } else if(!editingCustomerId){
    document.getElementById('prepaid3mHint').textContent = t('prepaid3m.hint');
  }
  if(isEditingPostpaid && currentSvc){
    renderTileRadioGroup('pe_workType_group', POSTPAID_WORK_TYPES, currentSvc.workType || customer.workType || '');
    renderPostpaidPlanTiles('pe_plan_group', currentSvc.plan || '');
    renderTileRadioGroup('pe_contractLength_group', POSTPAID_CONTRACT_DAYS.map(String), String(currentSvc.durationDays||POSTPAID_CONTRACT_DAYS[0]));
    renderTileRadioGroup('pe_company_group', POSTPAID_COMPANIES, currentSvc.company || '');
    renderTileRadioGroup('pe_partnerCompany_group', POSTPAID_PARTNER_COMPANIES, currentSvc.partnerCompany || '');
    renderTileRadioGroup('pe_svcCarrierType_group', POSTPAID_CARRIER_TYPES, currentSvc.svcCarrierType || '');
    document.getElementById('pe_number').value = currentSvc.number || customer.phone || '';
    document.getElementById('pe_activationDate').value = currentSvc.activationDate || todayISO();
    document.getElementById('pe_monthlyFee').value = currentSvc.monthlyFee ?? '';
    document.getElementById('pe_expectedProfit').value = currentSvc.expectedProfit ?? '';
    document.getElementById('pe_actualProfit').value = currentSvc.actualProfit ?? '';
    document.getElementById('pe_usimFee').value = currentSvc.usimFee ?? '';
    document.getElementById('pe_discountPerMonth').value = currentSvc.discountPerMonth ?? '';
    document.getElementById('pe_discountMonths').value = currentSvc.discountMonths ?? '';
    updatePeNetExpectedPreview();
  }
  if(!isEditingPostpaid) refreshP3TemplateOptions();
  document.getElementById('deleteCustomerBtn').style.display = customer ? '' : 'none';
  document.getElementById('customerModalOverlay').classList.add('show');
  if(window.refreshCustomerForms) refreshCustomerForms(); // card layout (new prepaid only)
}
/* Korean ARC numbers are formatted 6 digits - 7 digits (e.g. 123456-1234567), like a resident
   registration number; passport numbers have no fixed dash pattern, just plain uppercase. */
function formatIdNumberInput(){
  const idType = document.getElementById('f_idType_group').dataset.selected || 'ARC';
  const el = document.getElementById('f_idNumber');
  if(idType==='ARC'){
    let digits = el.value.replace(/[^0-9]/g,'').slice(0,13);
    el.value = digits.length>6 ? digits.slice(0,6)+'-'+digits.slice(6) : digits;
  } else {
    el.value = el.value.replace(/-/g,'').toUpperCase();
  }
}
document.getElementById('f_idNumber').addEventListener('input', formatIdNumberInput);
document.getElementById('f_idType_group').addEventListener('click', ()=> setTimeout(formatIdNumberInput, 0));
/* birthday entered directly as 6 digits, Korean resident-number style (YYMMDD) — digits only,
   no separators, capped at 6 characters as you type */
document.getElementById('f_dob').addEventListener('input', e=>{
  e.target.value = e.target.value.replace(/[^0-9]/g,'').slice(0,6);
});
document.getElementById('f_idExpiry').addEventListener('input', e=>{
  e.target.value = e.target.value.replace(/[^0-9]/g,'').slice(0,6);
  updateIdExpiryHint();
});
/* readable line under ID expiry: "Jan 1, 2029 · in 26 months" / "expired" / how to type it */
function updateIdExpiryHint(){
  const inp = document.getElementById('f_idExpiry'); if(!inp) return;
  const field = inp.closest('.form-field') || inp.parentElement;
  let el = field.querySelector(':scope > .nf-dobinfo.expiry-hint');
  if(!el){ el = document.createElement('div'); el.className = 'nf-dobinfo expiry-hint'; field.appendChild(el); }
  const zh = LANG==='zh';
  const iso = parseExpiryFlexible(inp.value);
  let txt = '', cls = '';
  if(iso){
    const d = new Date(iso+'T00:00:00');
    const months = Math.round(daysBetween(todayISO(), iso)/30.44);
    const when = months<0 ? (zh?'已过期':'already expired') : months===0 ? (zh?'本月到期':'expires this month') : (zh?`还有 ${months} 个月`:`in ${months} month${months===1?'':'s'}`);
    txt = d.toLocaleDateString(zh?'zh-CN':'en-US',{year:'numeric',month:'short',day:'numeric'}) + ' · ' + when;
    cls = months<3 ? 'warn' : 'ok';
  } else if(!inp.value){
    txt = zh ? '输入6位数字：年、月、日' : 'Type 6 digits: year, month, day';
  } else if(inp.value.length===6){
    txt = zh ? '日期无效' : 'Not a valid date'; cls = 'warn';
  }
  if(el.textContent!==txt) el.textContent = txt;
  el.className = 'nf-dobinfo expiry-hint ' + cls;
}
/* postpaid-only companies/carrier that a given prepaid plan is allowed to use — three months
   uses one supplier pairing, 1-2 months uses another, and the 15-day plan is unrestricted */
/* All company / carrier type options are available for every prepaid duration — there's no
   real reason 30/60/90-day plans should be more restricted than 15-day ones, and it was
   confusing staff who expected the same full set of choices no matter which plan length
   they picked, whether signing someone up new or recharging an existing customer. */
function prepaidCompanyCarrierOptionsFor(days){
  return {companies:PREPAID_COMPANIES, carriers:POSTPAID_CARRIER_TYPES};
}
/* prepaid is a flat one-time catalog price — auto-fill it from the selected plan, but leave
   it editable in case of a discount or special case */
function updatePrepaidPriceFromPlan(){
  const days = Number(document.getElementById('p3_prepaidPlan_group').dataset.selected)||90;
  const plan = PREPAID_PLANS.find(p=>p.days===days);
  document.getElementById('p3_price').value = plan ? plan.price : '';
  const {companies, carriers} = prepaidCompanyCarrierOptionsFor(days);
  const curCompany = document.getElementById('p3_company_group').dataset.selected;
  const curCarrier = document.getElementById('p3_svcCarrierType_group').dataset.selected;
  renderTileRadioGroup('p3_company_group', companies, companies.includes(curCompany) ? curCompany : '');
  renderTileRadioGroup('p3_svcCarrierType_group', carriers, carriers.includes(curCarrier) ? curCarrier : '');
  refreshP3TemplateOptions();
  updateP3FinalPricePreview();
}
document.getElementById('p3_prepaidPlan_group').addEventListener('click', ()=> setTimeout(updatePrepaidPriceFromPlan, 0));
function updateP3FinalPricePreview(){
  const price = Number(document.getElementById('p3_price').value)||0;
  const discount = Number(document.getElementById('p3_discount').value)||0;
  document.getElementById('p3_finalPricePreview').value = fmtWon(Math.max(0, price - discount));
}
['p3_price','p3_discount'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updateP3FinalPricePreview);
});
function updatePeNetExpectedPreview(){
  const expected = Number(document.getElementById('pe_expectedProfit').value)||0;
  const usimFee = Number(document.getElementById('pe_usimFee').value)||0;
  const perMonth = Number(document.getElementById('pe_discountPerMonth').value)||0;
  const months = Number(document.getElementById('pe_discountMonths').value)||0;
  document.getElementById('pe_netExpectedPreview').value = fmtWon(Math.max(0, expected - (perMonth*months) - usimFee));
}
['pe_expectedProfit','pe_usimFee','pe_discountPerMonth','pe_discountMonths'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updatePeNetExpectedPreview);
});
function refreshP3TemplateOptions(){
  const days = Number(document.getElementById('p3_prepaidPlan_group').dataset.selected)||90;
  const p3tpl = document.getElementById('p3_template');
  // General signups should only ever offer general carrier forms — Information-change
  // templates (Passport → ARC) are a completely separate 2-page flow of their own and must
  // never show up here, which used to be exactly the mix-up: uploading one made it appear as
  // a choice when adding a brand new customer.
  const generalTemplates = getGeneralTemplates();
  if(!generalTemplates.length){
    p3tpl.innerHTML = `<option value="">${LANG==='zh'?'（尚未上传模板，请先在「打印模板」页面上传）':'(no templates yet — upload one in Print Templates)'}</option>`;
    return;
  }
  p3tpl.innerHTML = generalTemplates.map(tp=>`<option value="${tp.id}">${escapeHtml(tp.name)}</option>`).join('');
  const preeti = getTemplate('tpl_preeti_3m');
  if(days===90 && preeti){
    p3tpl.value = preeti.id;
  } else {
    // the 15/30/60-day tiers use a different template than the fixed 90-day ("3-month
    // recharge") Preeti form — prefer a non-Preeti template if the store has uploaded one,
    // otherwise leave the first option selected and let staff pick manually
    const nonPreeti = generalTemplates.find(tp=>tp.id!=='tpl_preeti_3m');
    p3tpl.value = nonPreeti ? nonPreeti.id : generalTemplates[0].id;
  }
}
/* populates the shared Company / Partner Company / Carrier Type dropdowns for a given
   field-id prefix (cs_, o_), used across the Change Subscription and Order modals so the
   option lists stay in sync in one place */
function populatePostpaidOptionSelects(prefix){
  const fill = (id, options) => {
    const el = document.getElementById(id);
    if(el && !el.options.length) el.innerHTML = options.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  };
  fill(prefix+'company', POSTPAID_COMPANIES);
  fill(prefix+'partnerCompany', POSTPAID_PARTNER_COMPANIES);
  fill(prefix+'svcCarrierType', POSTPAID_CARRIER_TYPES);
}
let editingCustomerId = null;
let selectedRating = 5;
function setRatingStars(n){
  selectedRating = n;
  const el = document.getElementById('f_rating');
  el.innerHTML = [1,2,3,4,5].map(i=>`<span data-star="${i}" class="${i<=n?'on':''}">★</span>`).join('');
}
document.getElementById('f_rating').addEventListener('click', e=>{
  if(e.target.dataset.star) setRatingStars(Number(e.target.dataset.star));
});

function saveCustomerFromForm(){
  if(window.newCustomerArcBlocked && newCustomerArcBlocked()) return; // ARC must not expire within 3 months (new prepaid)
  // new customers only — an existing pair that legitimately shares a number shouldn't be asked on every edit
  if(!editingCustomerId && !confirmNoDuplicates('cust')) return;
  // Company and Carrier Type are required for prepaid — checked here, before ANYTHING is
  // saved, so a failed check never leaves a half-created customer record behind (with no
  // service attached) if this ran after the customer record was already written.
  const willBePrepaid = editingCustomerId ? getCustomer(editingCustomerId)?.subType!=='postpaid' : true;
  if(willBePrepaid){
    if(!document.getElementById('p3_company_group').dataset.selected){
      toast(LANG==='zh'?'请选择加入的公司':'Please select a Company'); return;
    }
    if(!document.getElementById('p3_svcCarrierType_group').dataset.selected){
      toast(LANG==='zh'?'请选择通信社类型':'Please select a Carrier Type'); return;
    }
  }
  const cust = buildAndSaveCustomer();
  if(!cust) return;
  // "Edit profile" updates the customer's CURRENT plan in place (no new history entry —
  // that's what Recharge / Change Plan are for). For a BRAND NEW prepaid customer, this
  // button creates their first service directly.
  if(!editingCustomerId && cust.subType!=='postpaid'){
    const svcData = buildPrepaidServiceFromForm(cust);
    setActiveSubscription(cust.id, svcData, 'new');
  } else if(editingCustomerId){
    const currentSvc = activeSubscriptionFor(editingCustomerId);
    if(currentSvc && cust.subType!=='postpaid'){
      const durationDays = Number(document.getElementById('p3_prepaidPlan_group').dataset.selected)||currentSvc.durationDays||90;
      const price = Number(document.getElementById('p3_price').value)||0;
      const discount = Number(document.getElementById('p3_discount').value)||0;
      const finalPrice = Math.max(0, price-discount);
      Object.assign(currentSvc, {
        durationDays, price, discount, sellingPrice:finalPrice, received:finalPrice,
        usimNumber: document.getElementById('p3_usimNumber').value.trim(),
        activationDate: document.getElementById('p3_activationDate').value || currentSvc.activationDate,
        company: document.getElementById('p3_company_group').dataset.selected || currentSvc.company,
        svcCarrierType: document.getElementById('p3_svcCarrierType_group').dataset.selected || currentSvc.svcCarrierType,
        carrier: document.getElementById('p3_svcCarrierType_group').dataset.selected || currentSvc.carrier,
        paymentMethod: document.getElementById('p3_paymentMethod_group').dataset.selected || currentSvc.paymentMethod,
        simType: document.getElementById('p3_simType_group').dataset.selected || currentSvc.simType,
      });
      if(currentSvc.activationDate && durationDays){
        const d = new Date(currentSvc.activationDate); d.setDate(d.getDate()+durationDays);
        currentSvc.expiryDate = d.toISOString().slice(0,10);
      }
    } else if(currentSvc && cust.subType==='postpaid'){
      const durationDays = Number(document.getElementById('pe_contractLength_group').dataset.selected)||currentSvc.durationDays;
      Object.assign(currentSvc, {
        workType: document.getElementById('pe_workType_group').dataset.selected || currentSvc.workType,
        plan: document.getElementById('pe_plan_group').dataset.selected || '',
        durationDays,
        company: document.getElementById('pe_company_group').dataset.selected || currentSvc.company,
        partnerCompany: document.getElementById('pe_partnerCompany_group').dataset.selected || currentSvc.partnerCompany,
        svcCarrierType: document.getElementById('pe_svcCarrierType_group').dataset.selected || currentSvc.svcCarrierType,
        carrier: document.getElementById('pe_svcCarrierType_group').dataset.selected || currentSvc.carrier,
        number: document.getElementById('pe_number').value.trim(),
        activationDate: document.getElementById('pe_activationDate').value || currentSvc.activationDate,
        monthlyFee: Number(document.getElementById('pe_monthlyFee').value)||0,
        expectedProfit: Number(document.getElementById('pe_expectedProfit').value)||0,
        actualProfit: Number(document.getElementById('pe_actualProfit').value)||0,
        usimFee: Number(document.getElementById('pe_usimFee').value)||0,
        discountPerMonth: Number(document.getElementById('pe_discountPerMonth').value)||0,
        discountMonths: Number(document.getElementById('pe_discountMonths').value)||0,
      });
      if(currentSvc.activationDate && durationDays){
        const d = new Date(currentSvc.activationDate); d.setDate(d.getDate()+durationDays);
        currentSvc.expiryDate = d.toISOString().slice(0,10);
      }
    }
  }
  saveDB(DB);
  closeAllModals();
  toast(t('toast.customerSaved'));
  // Editing an existing customer should return to THEIR (now updated) detail page —
  // previously this always navigated to the general list page instead, leaving the detail
  // view's content stale until the person happened to reopen it manually. This is exactly
  // what made a successful name edit look like it had silently failed: the data was
  // correct, but the screen kept showing the old name.
  if(editingCustomerId){
    openCustomerDetail(editingCustomerId);
  } else {
    goTo(currentPage==='dashboard'?'sheet':currentPage);
  }
  renderPage(currentPage);
  renderNav();
}
function buildAndSaveCustomer(){
  const name = document.getElementById('f_name').value.trim();
  if(!name){ toast(LANG==='zh'?'请输入客户姓名':'Please enter a customer name'); return null; }
  return saveCustomerCore(name);
}
function saveCustomerCore(name){
  // this modal is only reachable for NEW customers via the Prepaid choice, or for editing an
  // EXISTING customer of any type — never reset an existing customer's subType back to
  // prepaid just because this shared form has no type selector anymore
  const subType = editingCustomerId ? (getCustomer(editingCustomerId)?.subType || 'prepaid') : 'prepaid';
  const idType = document.getElementById('f_idType_group').dataset.selected || 'ARC';
  const occupation = document.getElementById('f_occupation_group').dataset.selected || '';
  const data = {
    name: name.toUpperCase(), phone:document.getElementById('f_phone').value.trim(),
    nationality:document.getElementById('f_nationality').value.trim().toUpperCase(),
    dob:parseDobFlexible(document.getElementById('f_dob').value) || '',
    idType,
    idNumber:document.getElementById('f_idNumber').value.trim().toUpperCase(),
    idExpiry:parseExpiryFlexible(document.getElementById('f_idExpiry').value) || '',
    occupation,
    years:document.getElementById('f_years').value?Number(document.getElementById('f_years').value):0,
    referral:document.getElementById('f_referral').value,
    carrierType:document.getElementById('f_carrierType').value,
    planType:document.getElementById('f_planType').value,
    branchOffice:document.getElementById('f_branchOffice').value,
    handlerName: document.getElementById('f_handlerName').value || '',
    subType,
    address:document.getElementById('f_address').value.trim(),
    notes:document.getElementById('f_notes').value.trim(),
    rating:selectedRating,
  };
  if(editingCustomerId){
    Object.assign(getCustomer(editingCustomerId), data);
    return getCustomer(editingCustomerId);
  } else {
    data.id = uid('c');
    data.createdAt = todayISO();
    DB.customers.push(data);
    return data;
  }
}

/* save customer + create the matching service record + open print preview.
   Prepaid is billed by catalog day-tiers (15/30/60/90) — 90 days auto-applies the fixed
   Preeti Telecom template; the other tiers use whatever other template the store has set up. */
/* Builds the prepaid service record from the form's current values — shared by both
   "Save & Print" (which additionally requires a template and opens the print preview) and
   the plain "Save customer" button, so a new prepaid signup can be saved without being
   forced through template selection. Company and Carrier Type are still required before
   either save path runs — validated by the caller before this is ever called. */
function buildPrepaidServiceFromForm(cust){
  const activationDate = document.getElementById('p3_activationDate').value || todayISO();
  const durationDays = Number(document.getElementById('p3_prepaidPlan_group').dataset.selected)||90;
  const price = Number(document.getElementById('p3_price').value)||0;
  const discount = Number(document.getElementById('p3_discount').value)||0;
  const finalPrice = Math.max(0, price - discount);
  const planInfo = PREPAID_PLANS.find(p=>p.days===durationDays);
  const d = new Date(activationDate); d.setDate(d.getDate()+durationDays);
  return {
    customerId: cust.id, type:'prepaid',
    carrier: cust.carrierType || document.getElementById('f_carrierType').value,
    plan: durationDays===90 ? PREETI_FIXED_PLAN : (planInfo ? `${planInfo.days}일` : `${durationDays}일`),
    number: document.getElementById('p3_number').value.trim(),
    usimNumber: document.getElementById('p3_usimNumber').value.trim(),
    simType: document.getElementById('p3_simType_group').dataset.selected || 'physical', activationDate, durationDays,
    expiryDate: d.toISOString().slice(0,10), status:'active',
    price, discount, sellingPrice:finalPrice, cost:0, received:finalPrice, paymentMethod: document.getElementById('p3_paymentMethod_group').dataset.selected || '', commission:0, notes:'',
    company: document.getElementById('p3_company_group').dataset.selected || '',
    svcCarrierType: document.getElementById('p3_svcCarrierType_group').dataset.selected || '',
    monthlyFee:0, firstMonthPayment:0, activationFee:0, simFee:0,
  };
}
function saveCustomerAndPrint(){
  if(window.newCustomerArcBlocked && newCustomerArcBlocked()) return;
  const name = document.getElementById('f_name').value.trim();
  if(!name){ toast(LANG==='zh'?'请输入客户姓名':'Please enter a customer name'); return; }
  if(!confirmNoDuplicates('cust')) return;
  if(!document.getElementById('p3_company_group').dataset.selected){
    toast(LANG==='zh'?'请选择加入的公司':'Please select a Company'); return;
  }
  if(!document.getElementById('p3_svcCarrierType_group').dataset.selected){
    toast(LANG==='zh'?'请选择通信社类型':'Please select a Carrier Type'); return;
  }
  const templateId = document.getElementById('p3_template').value;
  if(!templateId || !getTemplate(templateId)){
    toast(LANG==='zh'?'请先在「打印模板」页面上传运营商表格':'Please upload a carrier form in Print Templates first');
    closeAllModals();
    goTo('templates');
    return;
  }
  const cust = saveCustomerCore(name);
  const svcData = buildPrepaidServiceFromForm(cust);
  // routes through the same enforcement path as every other subscription change, so saving
  // here for a customer who already has an active plan correctly ends the old one instead
  // of silently creating a second "active-looking" subscription
  const prevActive = activeSubscriptionFor(cust.id);
  const reason = prevActive ? 'plan_change' : 'new';
  const svc = setActiveSubscription(cust.id, svcData, reason);
  saveDB(DB);
  closeAllModals();
  toast(t('toast.customerSaved'));
  renderPage(currentPage);
  renderNav();
  openPrintPreview(cust.id, svc.id, templateId);
}

/* delete a customer and all of their service/order records */
function deleteCustomerById(id){
  const c = getCustomer(id);
  if(!c) return;
  const svcCount = customerServices(id).length;
  const warning = svcCount
    ? (LANG==='zh'
        ? `确定要删除客户「${c.name}」吗？其名下的 ${svcCount} 条业务记录也会一并删除。此操作无法撤销。`
        : `Delete customer "${c.name}"? This will also delete their ${svcCount} order/service record(s). This cannot be undone.`)
    : (LANG==='zh'
        ? `确定要删除客户「${c.name}」吗？此操作无法撤销。`
        : `Delete customer "${c.name}"? This cannot be undone.`);
  if(!confirm(warning)) return;
  DB.customers = DB.customers.filter(x=>x.id!==id);
  DB.services = DB.services.filter(s=>s.customerId!==id);
  saveDB(DB);
  deleteCustomerOnServer(id);
  closeAllModals();
  toast(t('toast.deleted'));
  renderPage(currentPage==='dashboard' ? 'customers' : currentPage);
  renderNav();
}

/* customer detail */
let detailCustomerId = null;
/* ---- Customer profile building blocks (the profile is drawn in its final card layout
   directly — it used to be drawn plain, then rebuilt by a watcher that matched label text) ---- */
const PF_ICON = {
  sub:'<path d="M8 3h7l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM10 12h6M10 16h6M13 9v10"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  hist:'<path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>',
  cash:'<path d="M12 6v12M9 9.5c0-1 1-1.8 3-1.8s3 .8 3 1.8-1 1.5-3 2-3 1-3 2 1 1.8 3 1.8 3-.8 3-1.8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>',
  ai:'<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  warn:'<path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  more:'<path d="M5 12h.01M12 12h.01M19 12h.01"/>'
};
const PF_BTN_ICON = {
  btnRecharge:'<rect x="3" y="8" width="16" height="8" rx="2"/><path d="M21 11v2M10 10l-2 2h4l-2 2"/>',
  swap:'<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  freeze:'<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/>',
  btnCancelSub:'<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  btnRequestIdChange:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h4M7 14h6M15 10h2"/>',
  btnStartNewSub:'<path d="M12 5v14M5 12h14"/>',
  btnUndoCancel:'<path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
  print:'<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/>',
  btnCompleteIdChange:'<path d="M5 12l5 5 9-10"/>',
  btnMergeFromProfile:'<path d="M6 4v6a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v2M18 4v6"/>'
};
function pfSvg(paths, style){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${style?` style="${style}"`:''}>${paths}</svg>`; }
/* small icon at the start of a button label */
function pfBtnIcon(key){ return PF_BTN_ICON[key] ? `<span class="pf-bi">${pfSvg(PF_BTN_ICON[key])}</span>` : ''; }
function pfTitle(text, icon, cls, style){ return `<div class="pf-title"${style?` style="${style}"`:''}><span class="pf-ib ${cls||''}">${pfSvg(PF_ICON[icon])}</span><span>${escapeHtml(text)}</span></div>`; }
/* "What the customer pays" (postpaid) and "What the store earns" blocks of a plan */
function serviceMonthlyPaymentHtml(s, extraClass){
  if(s.type!=='postpaid') return '';
  const fee = Number(s.monthlyFee)||0, dis = Number(s.discountPerMonth)||0;
  // Inside the profile's Income card the amount shown is what the customer actually pays
  // after the monthly discount, with the plan price and discount spelled out underneath.
  const net = extraClass && dis>0 && fee>0;
  const won = n=> '₩'+Math.max(0,Math.round(n)).toLocaleString('en-US');
  return `<div class="profile-subcard${extraClass?' '+extraClass:''}" style="background:#FFF8E8;border-color:#F5DFA6;">
      <div class="profile-subcard-title" style="color:#946200;">${t('f.monthlyPayment')}</div>
      <div style="font-size:22px;font-weight:800;color:#946200;">${net ? won(fee-dis) : fmtWon(s.monthlyFee)}</div>
      ${net ? `<div class="muted" style="font-size:12.5px;margin-top:2px;font-weight:600;">${won(fee)} ${__T('plan price')} − ${won(dis)} ${__T('monthly discount')}</div>` : ''}
      <div class="muted" style="font-size:11px;margin-top:2px;">${t('f.monthlyPaymentHint')}</div>
    </div>`;
}
function serviceFeeSectionHtml(s, extraClass){
  const cls = extraClass ? ' '+extraClass : '';
  if(s.type==='prepaid') return `<div class="profile-subcard${cls}" style="background:#EAF7EF;border-color:#BEE6CC;">
        <div class="profile-subcard-title" style="color:var(--green);">${t('rep.prepaidIncome')}</div>
        <div style="font-size:22px;font-weight:800;color:var(--green);">${fmtWon(s.sellingPrice)}</div>
      </div>`;
  if(s.type==='postpaid') return `<div class="profile-subcard${cls}" style="background:#EAF3FF;border-color:#BFDCFF;">
        <div class="profile-subcard-title" style="color:var(--blue);">${t('detail.storeIncome')}</div>
        <div class="kv-grid">
          <div><div class="k">${t('f.expectedProfit')}</div><div class="v">${fmtWon(s.expectedProfit)}</div></div>
          <div><div class="k">${t('f.actualProfit')}</div><div class="v">${s.actualProfit?fmtWon(s.actualProfit):`<span class="muted">${t('stat.notReconciled')}</span>`}</div></div>
          <div><div class="k">${t('f.usimFee')}</div><div class="v">${fmtWon(s.usimFee)}</div></div>
          <div><div class="k">${t('f.discountTotal')}</div><div class="v">${fmtWon(discountTotalFor(s))}</div></div>
        </div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #BFDCFF;">
          <div class="k">${netIncomeLabelFor(s)}</div>
          <div style="font-size:20px;font-weight:800;color:var(--blue);">${fmtWon(netProfitFor(s))}</div>
        </div>
      </div>`;
  return `<div class="kv-grid" style="margin-top:10px;">
        <div><div class="k">${t('f.sellingPrice')}</div><div class="v">${fmtWon(s.sellingPrice)}</div></div>
        <div><div class="k">${t('f.received')}</div><div class="v">${fmtWon(s.received)}</div></div>
        <div><div class="k">${t('col.outstanding')}</div><div class="v" style="color:${(s.sellingPrice-s.received)>0?'var(--red)':'inherit'}">${fmtWon(Math.max(0,(s.sellingPrice||0)-(s.received||0)))}</div></div>
        <div><div class="k">${t('f.commission')}</div><div class="v">${fmtWon(s.commission)}</div></div>
      </div>`;
}
/* Rows of the profile's "Plan info" card: the plan's rows first, then the customer's own,
   one row per subject (a blank plan value gives way to the customer's value). The first six
   subjects show; everything else sits under "More". */
function profileInfoRows(c, s){
  const rows = []; // [key, label, value]
  const yrs = v=> `${v} ${t('years.suffix')}`;
  if(s){
    rows.push(['phone', t('f.number'), s.number||'—']);
    rows.push(['dob', t('f.dob'), c.dob?fmtDateHuman(c.dob):'—']);
    rows.push(['plan', t('f.plan'), s.plan||'—']);
    rows.push(['subscription', t('col.subType'), s.type==='postpaid'?t('opt.postpaidShort'):t('opt.prepaidShort')]);
    if(c.planType) rows.push(['planType', t('f.planType'), c.planType]);
    if(s.company) rows.push(['company', t('f.company'), s.company]);
    if(s.partnerCompany) rows.push(['partner', t('f.partnerCompany'), s.partnerCompany]);
    if(s.svcCarrierType) rows.push(['carrier', t('f.svcCarrierType'), s.svcCarrierType]);
    if(c.years!=null) rows.push(['years', t('f.years'), yrs(c.years)]);
  }
  rows.push(['phone', t('f.phone'), c.phone||'—']);
  rows.push(['occupation', t('f.occupation'), c.occupation||'—']);
  rows.push(['years', t('f.years'), yrs(c.years||0)]);
  rows.push(['network', t('f.carrierType'), c.carrierType||'—']);
  rows.push(['planType', t('f.planType'), c.planType||'—']);
  rows.push(['subscription', t('f.subType'), c.subType==='postpaid'?t('opt.postpaidShort'):t('opt.prepaidShort')]);
  if(c.workType) rows.push(['workType', t('f.workType'), c.workType]);
  if(c.handlerName) rows.push(['handler', t('f.handlerName'), c.handlerName]);
  rows.push(['address', t('f.address'), c.address||'—']);
  rows.push(['notes', t('f.notes'), c.notes||'—']);
  const blank = v=> /^(—|-|)$/.test(String(v).trim());
  const pool = {}, order = [];
  rows.forEach(r=>{
    if(!pool[r[0]]){ pool[r[0]] = r; order.push(r[0]); }
    else if(blank(pool[r[0]][2]) && !blank(r[2])) pool[r[0]] = r;
  });
  const KEY = ['phone','dob','company','carrier','subscription','years'];
  const shown = KEY.filter(k=>pool[k]).map(k=>pool[k]);
  const extra = (c.nationality ? [['nationality', __T('Nationality'), c.nationality]] : [])
    .concat(order.filter(k=>!KEY.includes(k)).map(k=>pool[k]));
  return {shown, extra};
}
function profileInfoRowHtml(r, hidden){
  const copy = r[0]==='phone' && !/^(—|-|)$/.test(String(r[2]).trim())
    ? `<button type="button" class="pf-copy" data-copy-phone="${escapeHtml(r[2])}" title="${escapeHtml(__T('Copy phone number'))}" aria-label="${escapeHtml(__T('Copy phone number'))}">${pfSvg(PF_ICON.copy)}</button>` : '';
  return `<div${hidden?' class="pf-extra" style="display:none"':''}><div class="k">${escapeHtml(r[1])}</div><div class="v">${escapeHtml(r[2])}${copy}</div></div>`;
}
/* The profile's "Current plan" service card: plan, status, tiles, dates and progress. */
function profileActivePlanHtml(s, c){
  const st = computedStatus(s);
  let progressPct = 0;
  if(s.activationDate && s.expiryDate){
    const total = daysBetween(s.activationDate, s.expiryDate) || 1;
    const used = daysBetween(s.activationDate, todayISO());
    progressPct = Math.min(100, Math.max(0, (used/total)*100));
  }
  const usedDays = usedDaysFor(s);
  const len = planLengthLabel(s);
  const tile = (k,v,cls)=> `<div class="pf-tile${cls?' '+cls:''}"><b>${escapeHtml(__T(k))}</b><span>${escapeHtml(v)}</span></div>`;
  const tiles = (s.company||s.svcCarrierType||len) ? `<div class="pf-tiles">${
      (s.company?tile('Company', s.company):'') + (s.svcCarrierType?tile('Carrier type', s.svcCarrierType):'') +
      (len?tile('Plan length', len[1], /^(m[123]|rc)$/.test(len[0])?len[0]:''):'')}</div>` : '';
  // Recharge customers: which plan they had before
  let prev = '';
  if(tiles && len && len[0]==='rc'){
    const p = customerServices(c.id).filter(x=>x.type==='prepaid' && x.id!==s.id && String(x.activationDate||'')<=String(s.activationDate||'9999'))
      .sort((a,b)=> String(b.activationDate||'').localeCompare(String(a.activationDate||'')))[0];
    if(p){
      const pl = planLengthLabel(p);
      const fmt = x=>{ try{ return new Date(x+'T00:00:00').toLocaleDateString(LANG==='zh'?'zh-CN':'en-US',{month:'short',day:'numeric',year:'numeric'}); }catch(e){ return x||''; } };
      prev = `<div class="pf-prev"><span class="pf-prev-k">${escapeHtml(__T('Previous plan'))}</span><span class="pf-prev-v">${escapeHtml((pl?pl[1]:(p.durationDays+' days'))+(p.plan?' · '+p.plan:'')+' · '+fmt(p.activationDate)+' → '+fmt(p.endedAt||p.expiryDate))}</span></div>`;
    }
  }
  const status = contractStatusTextFor(s, false) + (usedDays!==null ? ` · ${__T('Used')} ${usedDays} ${LANG==='zh'?'天':'days'}` : '');
  const printBtn = (cls, style)=> `<button class="btn btn-sm btn-ghost" data-print-service="${s.id}"${style?` style="${style}"`:''}>${pfBtnIcon('print')}${t('btn.print')}</button>`;
  return `<div class="service-card">
    <div class="service-card-head">
      <div>
        <div style="font-weight:800;">${t('type.'+s.type)} · ${escapeHtml(s.carrier||'—')}</div>
        <div class="muted" style="font-size:12px;margin-top:2px;">${[s.plan?escapeHtml(s.plan):'', s.number?escapeHtml(s.number):'', s.simType==='esim'?'eSIM':t('opt.physical')].filter(Boolean).join(' · ')}</div>
      </div>
      <div style="text-align:right;">
        <span class="pill ${statusPillClass(st)}">${t('status.'+st)}</span>${len ? `<span class="plan-tag ${len[0]}">${escapeHtml(len[1])}</span>` : ''}
        ${isServiceCurrentlyFrozen(s) ? `<span class="pill" style="background:#DBEAFE;color:#1D4ED8;margin-left:4px;">🧊 ${t('freeze.frozen')}</span>` : ''}
        <button class="btn btn-sm btn-ghost" data-edit-order="${s.id}" style="margin-left:6px;" title="${LANG==='zh'?'编辑套餐详情（价格、已收款、日期…）':'Edit plan details (price, received, dates…)'}">${t('btn.editRecord')}</button>${(s.type==='prepaid' && s.durationDays!==90) ? printBtn('', 'margin-left:8px') : ''}
        <div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end;">
          ${(s.type==='prepaid' && s.durationDays===90) ? printBtn('', 'color:var(--orange);') : ''}
        </div>
      </div>
    </div>
    ${s.expiryDate ? `${tiles}${prev}<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap;">
      <div>
        <div class="muted" style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;">${t('detail.planStarted')}</div>
        <div style="font-size:15px;font-weight:800;">${fmtDateHuman(s.activationDate)}</div>
      </div>
      <div style="flex:1;text-align:center;color:var(--text-soft);font-size:13px;">→</div>
      <div style="text-align:right;">
        <div class="muted" style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;">${t('detail.planEnds')}</div>
        <div style="font-size:15px;font-weight:800;">${fmtDateHuman(s.expiryDate)}</div>
      </div>
    </div>
    <div class="progress-bar" style="margin-top:8px;"><div class="progress-fill ${progressStateClass(s)}" style="width:${progressPct}%"></div></div>
    <div class="muted" style="font-size:11.5px;margin-top:6px;">${status}</div>` : ''}
  </div>`;
}
function copyTextToClipboard(text, msg){
  const done = ()=> toast(msg || (LANG==='zh'?'已复制':'Copied'));
  const fallback = ()=>{ const a = document.createElement('textarea'); a.value = text; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); try{ document.execCommand('copy'); done(); }catch(e){} a.remove(); };
  try{ navigator.clipboard.writeText(text).then(done, fallback); }catch(e){ fallback(); }
}
/* Information change to an ARC is only accepted from age 19 */
function idChangeUnder19(){
  const c = getCustomer(idChangeCustomerId); const a = c ? calcAge(c.dob) : null;
  return {age:a, bad: a!==null && a<19};
}
function idChangeAgeWarn(){
  const inp = document.getElementById('idc_arcNumber'); if(!inp) return false;
  let w = document.getElementById('idc_ageWarn'); const r = idChangeUnder19(), bad = !!inp.value.trim() && r.bad;
  if(bad){
    if(!w){ w = document.createElement('div'); w.id = 'idc_ageWarn'; w.setAttribute('role','alert'); inp.insertAdjacentElement('afterend', w); }
    w.innerHTML = pfSvg(PF_ICON.warn)+'<span></span>';
    w.lastChild.textContent = LANG==='zh' ? '客户 '+r.age+' 岁。仅年满19岁方可办理变更为外国人登记证（ARC）。' : 'Customer is '+r.age+' years old. An Information change to a Resident Card (ARC) is only accepted from age 19.';
    inp.style.borderColor = 'var(--red)';
  } else { if(w) w.remove(); inp.style.borderColor = ''; }
  return bad;
}
function openCustomerDetail(id){
  detailCustomerId = id;
  // Delete lives behind "More" in the footer — hidden again every time a profile opens
  const delBtn = document.getElementById('detailDeleteBtn'); if(delBtn) delBtn.style.display = 'none';
  const moreBtn = document.getElementById('detailMoreBtn'); if(moreBtn) moreBtn.textContent = LANG==='zh' ? '⋯ 更多' : '⋯ More';
  const c = getCustomer(id);
  if(!c) return;
  const active = activeSubscriptionFor(id);
  const history = subscriptionHistoryFor(id);
  // A completed ID change isn't a service/plan record, but it's still a real event in this
  // customer's history — merging it into the same chronological timeline (rather than
  // leaving it as a separate, disconnected box) is what actually makes it "part of their
  // history" rather than just a status indicator that happens to sit near the history.
  const idChangeHistoryEntries = (c.idChangeRequest && c.idChangeRequest.status==='completed')
    ? [{sortDate: c.idChangeRequest.completedDate || c.idChangeRequest.requestedDate, html: idChangeHistoryItemHtml(c.idChangeRequest)}]
    : [];
  const combinedHistoryHtml = [
    ...history.map(s=>({sortDate: s.endedAt||s.activationDate||'', html: historyItemHtml(s)})),
    ...idChangeHistoryEntries,
  ].sort((a,b)=> new Date(b.sortDate||0) - new Date(a.sortDate||0)).map(x=>x.html).join('');
  const otherRecords = customerServices(id).filter(s=> !isSubscriptionType(s.type));
  const age = calcAge(c.dob);
  const intel = computeCustomerIntelligence(c);

  let actionButtons = '';
  // Only a genuinely PENDING or COMPLETED request should hide the "Request ID change"
  // button — checking truthiness of c.idChangeRequest alone used to hide it forever on any
  // leftover/partial object too (e.g. one left behind by the sync bug where the database
  // had no column to actually store this field: a request could get created locally, then
  // get overwritten mid-flight by a background pull into a half-formed object that was
  // neither pending nor completed). That left a customer with no banner, no history entry,
  // AND no way to ever request again — permanently stuck. Checking the actual status makes
  // the button reappear and self-heal whenever there's no real request in progress.
  const hasRealIdChangeRequest = !!(c.idChangeRequest && (c.idChangeRequest.status==='pending' || c.idChangeRequest.status==='completed'));
  if(active && active.type==='prepaid'){
    actionButtons = `
      <button class="btn btn-primary" id="btnRecharge">${pfBtnIcon('btnRecharge')}${t('btn.recharge')}</button>
      <button class="btn btn-ghost" id="btnChangeToPostpaid">${pfBtnIcon('swap')}${t('btn.changeToPostpaid')}</button>
      ${c.idType==='Passport' && !hasRealIdChangeRequest ? `<button class="btn btn-ghost" id="btnRequestIdChange">${pfBtnIcon('btnRequestIdChange')}${t('btn.requestIdChange')}</button>` : ''}
      <button class="btn btn-danger" id="btnCancelSub">${pfBtnIcon('btnCancelSub')}${t('btn.cancelSubscription')}</button>`;
  } else if(active && active.type==='postpaid'){
    const frozen = isServiceCurrentlyFrozen(active);
    actionButtons = `
      <button class="btn btn-primary" id="btnChangePlan">${pfBtnIcon('swap')}${t('btn.changePlan')}</button>
      <button class="btn btn-ghost" id="btnChangeToPrepaid">${pfBtnIcon('swap')}${t('btn.changeToPrepaid')}</button>
      ${frozen
        ? `<button class="btn btn-ghost" id="btnUnfreezeSim" style="color:#2563EB;">${pfBtnIcon('freeze')}${t('btn.unfreezeSim')}</button>`
        : `<button class="btn btn-ghost" id="btnFreezeSim" style="color:#2563EB;">${pfBtnIcon('freeze')}${t('btn.freezeSim')}</button>`}
      <button class="btn btn-danger" id="btnCancelSub">${pfBtnIcon('btnCancelSub')}${t('btn.cancelSubscription')}</button>`;
  } else {
    // any inactive customer with at least one past plan can be reactivated — not just
    // ones cancelled through the explicit "Cancel Subscription" button. Most inactive
    // customers ended up that way because their plan simply ran out, and staff need to be
    // able to bring them back just as easily as reversing an accidental cancellation.
    const mostRecent = [...customerServices(id)].filter(s=>isSubscriptionType(s.type)).sort((a,b)=> (b.endedSeq||0)-(a.endedSeq||0))[0];
    actionButtons = `<button class="btn btn-primary" id="btnStartNewSub">${pfBtnIcon('btnStartNewSub')}${t('btn.startNewSubscription').replace(/^[＋+]\s*/,'')}</button>`
      + (mostRecent ? ` <button class="btn btn-ghost" id="btnUndoCancel">${pfBtnIcon('btnUndoCancel')}${t('btn.undoCancel')}</button>` : '');
  }

  // Surfaces a pending Passport → Resident Card (ARC) change request right on the profile,
  // similar to how duplicate-detection works below — so staff see it immediately when
  // opening this customer, rather than needing to remember to check the Reminders tab.
  // Once completed, this banner intentionally disappears — the event still lives on, just
  // down in Plan History below, where every other change to this customer's record lives.
  let idChangeBannerHtml = '';
  if(c.idChangeRequest && c.idChangeRequest.status==='pending'){
    const req = c.idChangeRequest;
    const daysPending = daysBetween(req.requestedDate, todayISO());
    idChangeBannerHtml = `<div class="service-card" style="background:#EFF6FF;border-color:#BFDBFE;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-weight:800;color:#1D4ED8;">📄 ${t('rem.idChange.pendingTitle')}</div>
          <div class="section-desc" style="margin-top:4px;">${t('rem.idChange.requestedOn')} ${fmtDate(req.requestedDate)} (${daysPending} ${LANG==='zh'?'天前':'days ago'}) · ${t('rem.idChange.handledBy')} ${escapeHtml(req.handledBy||'—')}</div>
        </div>
        <button class="btn btn-ghost" id="btnPrintIdChange" style="flex:none;">${pfBtnIcon('print')}${t('btn.print')}</button>
        <button class="btn btn-primary" id="btnCompleteIdChange" style="flex:none;">${pfBtnIcon('btnCompleteIdChange')}${t('btn.markComplete')}</button>
      </div>
    </div>`;
  }
  // surface duplicate-detection right on the profile too, not just the Duplicates tab —
  // if this customer is the newest in their group, offer to merge directly from here;
  // otherwise point at whichever record IS the newest, since that's the one merge targets
  let dupeBannerHtml = '';
  const dupeGroupForThis = getDuplicateGroups().find(g=>g.some(x=>x.id===id));
  if(dupeGroupForThis && dupeGroupForThis.length>1){
    const sortedGroup = [...dupeGroupForThis].sort((a,b)=> new Date(customerJoinDate(b)||0)-new Date(customerJoinDate(a)||0));
    const isNewest = sortedGroup[0].id===id;
    const others = sortedGroup.filter(x=>x.id!==id);
    if(isNewest){
      dupeBannerHtml = `<div class="service-card" style="background:#FEF2F2;border-color:#FCA5A5;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-weight:800;color:#C0392B;">⚠ ${LANG==='zh'?'检测到重复档案':'Duplicate profiles detected'}</div>
            <div class="section-desc" style="margin-top:4px;">${LANG==='zh'?`与 ${others.length} 个其他档案重复（按姓名或电话匹配）。合并会将它们的历史记录并入本档案，并删除多余档案。`:`Matches ${others.length} other profile${others.length>1?'s':''} by name or phone. Merging moves their history into this one and removes the extras.`}</div>
          </div>
          <button class="btn btn-primary" id="btnMergeFromProfile" style="flex:none;">${pfBtnIcon('btnMergeFromProfile')}${t('btn.merge')}</button>
        </div>
      </div>`;
    } else {
      const newest = sortedGroup[0];
      dupeBannerHtml = `<div class="service-card" style="background:var(--gray-light);margin-bottom:16px;">
        <div style="font-weight:800;">ℹ ${LANG==='zh'?'这可能是重复档案':'This looks like a duplicate profile'}</div>
        <div class="section-desc" style="margin-top:4px;">${LANG==='zh'?'较新的档案':'The newer profile is'} <b>${escapeHtml(newest.name)}</b>（${fmtDate(customerJoinDate(newest))}）。${LANG==='zh'?'请到该档案进行合并。':'Merge from there instead.'}</div>
        <button class="btn btn-sm btn-ghost" style="margin-top:8px;" data-open-customer="${newest.id}">${LANG==='zh'?'前往该档案':'Go to that profile'} →</button>
      </div>`;
    }
  }
  const aiInsightHtml = intel.priority==='none' ? '' : `
    <div class="service-card" style="background:var(--blue-light);border-color:var(--blue);margin-bottom:16px;">
      <div class="service-card-head">
        ${pfTitle(t('ai.insight.title'), 'ai', 'o', 'font-weight:800;')}
        <span class="pill ${AI_PRIORITY_PILL[intel.priority]}">${AI_PRIORITY_ICON[intel.priority]} ${intel.score}/100</span>
      </div>
      <div class="kv-grid" style="margin-top:10px;">
        <div><div class="k">${t('ai.col.opportunity')}</div><div class="v">${intel.opportunityType==='none'?'—':t('ai.opp.'+intel.opportunityType)}</div></div>
        <div><div class="k">${t('ai.col.action')}</div><div class="v">${escapeHtml(intel.recommendedAction)}</div></div>
        <div><div class="k">${t('ai.col.currentRev')}</div><div class="v">${fmtWon(intel.currentRevenue)}</div></div>
        <div><div class="k">${t('ai.col.uplift')}</div><div class="v" style="color:${intel.uplift>0?'var(--green)':'inherit'}">${intel.uplift>0?'+':''}${fmtWon(intel.uplift)}</div></div>
      </div>
      <div class="section-desc" style="margin-top:10px;"><b>${LANG==='zh'?'原因：':'Why: '}</b>${escapeHtml(intel.reason)}</div>
    </div>`;

  // ---- final card layout: Current plan · Plan info · Plan history · Income · AI insight ----
  const actionBtnList = actionButtons.match(/<button[\s\S]*?<\/button>/g) || [];
  const firstBtns = actionBtnList.slice(0,3).join('\n'), restBtns = actionBtnList.slice(3).join('\n');
  const actionsHtml = `<div class="section-head"><div style="display:flex;gap:8px;">${firstBtns}${restBtns
      ? `<button type="button" class="btn btn-ghost pf-more">${pfSvg(PF_ICON.more,'width:16px;height:16px')}<span>${escapeHtml(__T('More'))}</span></button>` : ''}</div>${restBtns
      ? `<div class="pf-rest" style="display:none">${restBtns}</div>` : ''}</div>`;
  const currentCard = `<section class="pf-card">${pfTitle(__T('Current plan'),'sub')}
    <div id="detailActiveSub">${active ? profileActivePlanHtml(active, c) : `<div class="muted">${t('detail.noActiveSubscription')}</div>`}</div>
    ${actionsHtml}</section>`;
  const info = profileInfoRows(c, active);
  const infoGrid = `<div class="kv-grid">${info.shown.map(r=>profileInfoRowHtml(r,false)).join('')}${info.extra.map(r=>profileInfoRowHtml(r,true)).join('')}</div>`;
  const infoCard = `<section class="pf-card">${pfTitle(active ? t('detail.planInfo') : __T('Plan info'),'list')}
    ${active ? `<div class="profile-subcard">${infoGrid}</div>` : infoGrid}
    ${info.extra.length ? `<button type="button" class="btn btn-sm btn-ghost pf-toggle">${escapeHtml(__T('More'))}</button>` : ''}</section>`;
  const histCount = history.length + idChangeHistoryEntries.length;
  const histOpen = histCount>0 && histCount<=3;
  const histCard = `<section class="pf-card"><div class="pf-head-row"${histCount?'':' style="cursor:default"'}>${pfTitle(__T('Plan history')+' ('+histCount+')','hist','','margin:0')}<span class="pf-link">${histCount ? escapeHtml(__T(histOpen?'Hide':'Show')) : ''}</span></div>
    <div id="detailHistory" class="pf-hist-body"${histOpen?'':' style="display:none"'}>${histCount ? combinedHistoryHtml : `<div class="muted">${t('detail.noHistory')}</div>`}</div></section>`;
  const incomeParts = active && isSubscriptionType(active.type) ? serviceMonthlyPaymentHtml(active, 'pf-sub pf-monthly') + serviceFeeSectionHtml(active, 'pf-sub pf-store') : '';
  const incomeCard = incomeParts ? `<section class="pf-card pf-income">${pfTitle(__T('Income'),'cash','g')}${incomeParts}</section>` : '';
  const aiCard = aiInsightHtml ? `<section class="pf-card pf-ai">${aiInsightHtml}</section>` : '';
  const detailBody = document.getElementById('detailBody');
  detailBody.classList.add('pf');
  detailBody.innerHTML = `
    <div class="profile-head">
      <div class="profile-avatar">${initials(c.name)}</div>
      <div>
        <div class="profile-name">${escapeHtml(c.name)}<button class="copy-name-btn copy-name-btn-lg" data-copy-name="${c.id}" title="${t('btn.copyName')}">📋</button></div>
        <div class="profile-tags">
          <span class="pill pill-blue">${escapeHtml(c.nationality)}</span>
          <span class="pill pill-gray">${(c.idType?t('idtype.'+c.idType):'—')} · ${escapeHtml(c.idNumber||'—')}</span>
          ${age!==null?`<span class="pill pill-gray">${age} ${t('age.years')}</span>`:''}
          <span class="pill pill-gray">${'★'.repeat(c.rating||0)}</span>
        </div>
      </div>
    </div>
    ${idChangeBannerHtml}
    ${dupeBannerHtml}
    ${otherRecords.length ? `
    <div class="section-title" style="margin-bottom:10px;">${t('detail.otherRecords')}</div>
    <div id="detailOtherRecords">${otherRecords.map(s=>serviceCardHtml(s, c)).join('')}</div>` : ''}
    ${currentCard}
    ${infoCard}
    ${histCard}
    ${incomeCard}
    ${aiCard}
  `;
  document.getElementById('detailModalOverlay').classList.add('show');
  detailBody.querySelectorAll('[data-print-service]').forEach(b=>{
    b.addEventListener('click', ()=> quickPrintService(id, b.dataset.printService));
  });
  const moreBtnA = detailBody.querySelector('.pf-more'), rest = detailBody.querySelector('.pf-rest');
  if(moreBtnA && rest) moreBtnA.addEventListener('click', ()=>{ const o = rest.style.display==='none'; rest.style.display = o?'flex':'none'; moreBtnA.querySelector('span').textContent = __T(o?'Less':'More'); });
  const infoToggle = detailBody.querySelector('.pf-toggle');
  if(infoToggle){ let open = false; infoToggle.addEventListener('click', ()=>{ open = !open; detailBody.querySelectorAll('.pf-extra').forEach(r=> r.style.display = open?'':'none'); infoToggle.textContent = __T(open?'Less':'More'); }); }
  const histRow = detailBody.querySelector('.pf-head-row'), histBody = document.getElementById('detailHistory');
  if(histRow) histRow.addEventListener('click', ()=>{ const o = histBody.style.display==='none'; histBody.style.display = o?'':'none'; histRow.querySelector('.pf-link').textContent = __T(o?'Hide':'Show'); });
  detailBody.querySelectorAll('[data-copy-phone]').forEach(b=> b.addEventListener('click', e=>{
    e.stopPropagation(); copyTextToClipboard(b.dataset.copyPhone, __T('Phone number copied'));
  }));
  detailBody.querySelectorAll('[data-copy-name]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      copyCustomerNameToClipboard(btn.getAttribute('data-copy-name'), btn);
    });
  });
  const btnToPostpaid = document.getElementById('btnChangeToPostpaid');
  if(btnToPostpaid) btnToPostpaid.addEventListener('click', ()=> openChangeSubModal(id, 'to_postpaid'));
  const btnChangePlan = document.getElementById('btnChangePlan');
  if(btnChangePlan) btnChangePlan.addEventListener('click', ()=> openChangeSubModal(id, 'plan_change'));
  const btnRecharge = document.getElementById('btnRecharge');
  if(btnRecharge) btnRecharge.addEventListener('click', ()=> openPrepaidAssignModal(id, 'recharge'));
  const btnToPrepaid = document.getElementById('btnChangeToPrepaid');
  if(btnToPrepaid) btnToPrepaid.addEventListener('click', ()=> openPrepaidAssignModal(id, 'to_prepaid'));
  const btnCancelSub = document.getElementById('btnCancelSub');
  if(btnCancelSub) btnCancelSub.addEventListener('click', ()=> openCancelSubModal(id));
  const btnStartNew = document.getElementById('btnStartNewSub');
  if(btnStartNew) btnStartNew.addEventListener('click', ()=>{ closeAllModals(); openOrderModal(null, id); });
  const btnUndoCancel = document.getElementById('btnUndoCancel');
  if(btnUndoCancel) btnUndoCancel.addEventListener('click', ()=> undoCancellation(id));
  const btnFreezeSim = document.getElementById('btnFreezeSim');
  if(btnFreezeSim) btnFreezeSim.addEventListener('click', ()=> openFreezeSimModal(id));
  const btnUnfreezeSim = document.getElementById('btnUnfreezeSim');
  if(btnUnfreezeSim) btnUnfreezeSim.addEventListener('click', ()=> unfreezeSim(id));
  const btnReqIdChange = document.getElementById('btnRequestIdChange');
  if(btnReqIdChange) btnReqIdChange.addEventListener('click', ()=> openIdChangeModal(id));
  const btnPrintIdChange = document.getElementById('btnPrintIdChange');
  if(btnPrintIdChange) btnPrintIdChange.addEventListener('click', ()=> printIdChangeForm(id));
  const btnCompleteIdChange = document.getElementById('btnCompleteIdChange');
  if(btnCompleteIdChange) btnCompleteIdChange.addEventListener('click', ()=>{
    completeIdChangeRequest(id, ()=> openCustomerDetail(id));
  });
  const btnMergeFromProfile = document.getElementById('btnMergeFromProfile');
  if(btnMergeFromProfile) btnMergeFromProfile.addEventListener('click', ()=>{
    const group = getDuplicateGroups().find(g=>g.some(x=>x.id===id));
    if(!group || group.length<2) return;
    const sortedGroup = [...group].sort((a,b)=> new Date(customerJoinDate(b)||0)-new Date(customerJoinDate(a)||0));
    const others = sortedGroup.slice(1);
    const msg = LANG==='zh'
      ? `将「${others.map(c=>c.name).join(', ')}」的所有业务记录合并到「${sortedGroup[0].name}」（最新记录）中，其余重复客户档案将被删除，仅保留一个客户档案，历史套餐可在该客户资料中查看。是否继续？`
      : `This will move all service records from "${others.map(c=>c.name).join(', ')}" into "${sortedGroup[0].name}" (the newest record), then delete the other duplicate profiles — leaving just one customer with everything visible in their Plan History. Continue?`;
    if(!confirm(msg)) return;
    mergeDuplicateGroup(sortedGroup.map(c=>c.id));
    toast(LANG==='zh' ? '已合并重复客户' : 'Duplicate customers merged');
    openCustomerDetail(id);
    renderNav();
  });
}
function getService(id){ return DB.services.find(s=>s.id===id); }
function usedDaysFor(s){
  if(!s || !s.activationDate || !isIsoDate(s.activationDate)) return null;
  return Math.max(0, daysBetween(s.activationDate, todayISO()));
}
/* Plain-language framing of where a subscription stands relative to its contract — shared
   by the profile's Active Subscription card and the Customers list table, so the wording is
   always identical wherever it appears. Returns '' if there's no expiry date to judge by. */
function contractStatusTextFor(s, short){
  if(!s || !s.expiryDate) return '';
  const remaining = daysBetween(todayISO(), s.expiryDate);
  const isPostpaid = s.type==='postpaid';
  if(short){
    // compact form for a table column — same three states, fewer words
    if(remaining < 0) return isPostpaid
      ? (LANG==='zh' ? `已超合约 ${Math.abs(remaining)} 天` : `Over contract ${Math.abs(remaining)}d`)
      : (LANG==='zh' ? `已到期 ${Math.abs(remaining)} 天` : `Expired ${Math.abs(remaining)}d ago`);
    if(remaining <= 7) return LANG==='zh' ? `剩 ${remaining} 天（即将到期）` : `${remaining}d left (soon)`;
    return LANG==='zh' ? `合约内，剩 ${remaining} 天` : `${remaining}d left, in contract`;
  }
  // postpaid service doesn't just stop when the contract term ends — the customer keeps
  // their current plan or switches to a new one, so "expired" would be misleading; only
  // prepaid genuinely stops working once its paid-up period is over
  if(remaining < 0) return isPostpaid
    ? (LANG==='zh' ? `已超过合约期 ${Math.abs(remaining)} 天 — 可保留原套餐或更换新套餐` : `${Math.abs(remaining)} days over the contract term — can keep the current plan or switch to a new one`)
    : (LANG==='zh' ? `已超过合约期 ${Math.abs(remaining)} 天（已到期）` : `${Math.abs(remaining)} days past contract end — expired`);
  if(remaining <= 7) return LANG==='zh' ? `仍在合约内，剩余 ${remaining} 天（即将到期）` : `${remaining} days remaining, in contract — expiring soon`;
  return LANG==='zh' ? `仍在合约内，剩余 ${remaining} 天` : `${remaining} days remaining, in contract`;
}
/* Progress bar colour: red once a prepaid plan has expired, orange in its last 7 days,
   calm grey for a postpaid past its contract term (it keeps working — not an alarm). */
function progressStateClass(s){
  if(!s || !s.expiryDate) return '';
  const rem = daysBetween(todayISO(), s.expiryDate);
  if(rem < 0) return s.type==='postpaid' ? 'pg-over' : 'pg-expired';
  if(rem <= 7) return 'pg-soon';
  return '';
}
/* Plan-length tag for prepaid plans: 15 days / 1 / 2 / 3 months, or Recharge — a 30-day plan
   bought with the Recharge button, or priced ₩36,000 / ₩36,300 (except SAFARBAYEV BERIK, who is a
   normal 1-month plan). Returns [cssClass, label] or null. Used by the profile, Sheet View and
   the Excel export, so all three always agree. */
function planLengthLabel(s){
  if(!s || s.type!=='prepaid') return null;
  const d = Number(s.durationDays); let n = null;
  if(d>=85&&d<=95) n=3; else if(d>=55&&d<=65) n=2; else if(d>=28&&d<=35) n=1;
  const zh = LANG==='zh';
  if(!n) return (d>=13&&d<=17) ? ['m0', zh?'15天':'15 days'] : null;
  const pr = Number(s.sellingPrice!=null ? s.sellingPrice : s.price);
  let cn = ''; try{ cn = ((getCustomer(s.customerId)||{}).name||'').toUpperCase(); }catch(e){}
  const rc = n===1 && (/recharge/i.test(s.changeReason||'') || ((pr===36000||pr===36300) && cn.indexOf('SAFARBAYEV BERIK')<0));
  const txt = zh ? n+'个月' : n+(n>1?' months':' month');
  return rc ? ['rc', zh?'充值'+txt:'Recharge '+txt] : ['m'+n, txt];
}
function serviceCardHtml(s, customer){
  const st = computedStatus(s);
  let progressPct = 0;
  if(s.activationDate && s.expiryDate){
    const total = daysBetween(s.activationDate, s.expiryDate) || 1;
    const used = daysBetween(s.activationDate, todayISO());
    progressPct = Math.min(100, Math.max(0, (used/total)*100));
  }
  const usedDays = usedDaysFor(s);
  const contractStatusText = contractStatusTextFor(s, false);
  // "Who this is" — identity + plan basics, grouped in a neutral card since this is
  // reference info, not something that needs a color signal
  const identityCard = `<div class="profile-subcard">
      <div class="profile-subcard-title">${t('detail.planInfo')}</div>
      <div class="kv-grid">
        <div><div class="k">${t('f.number')}</div><div class="v">${s.number||'—'}</div></div>
        <div><div class="k">${t('f.dob')}</div><div class="v">${customer?.dob?fmtDateHuman(customer.dob):'—'}</div></div>
        <div><div class="k">${t('f.plan')}</div><div class="v">${escapeHtml(s.plan||'—')}</div></div>
        <div><div class="k">${t('col.subType')}</div><div class="v">${s.type==='postpaid'?t('opt.postpaidShort'):t('opt.prepaidShort')}</div></div>
        ${customer?.planType?`<div><div class="k">${t('f.planType')}</div><div class="v">${escapeHtml(customer.planType)}</div></div>`:''}
        ${s.company?`<div><div class="k">${t('f.company')}</div><div class="v">${escapeHtml(s.company)}</div></div>`:''}
        ${s.partnerCompany?`<div><div class="k">${t('f.partnerCompany')}</div><div class="v">${escapeHtml(s.partnerCompany)}</div></div>`:''}
        ${s.svcCarrierType?`<div><div class="k">${t('f.svcCarrierType')}</div><div class="v">${escapeHtml(s.svcCarrierType)}</div></div>`:''}
        ${usedDays!==null?`<div><div class="k">${t('f.usedDays')}</div><div class="v">${usedDays} ${LANG==='zh'?'天':'days'}</div></div>`:''}
        ${customer && customer.years!=null?`<div><div class="k">${t('f.years')}</div><div class="v">${customer.years} ${t('years.suffix')}</div></div>`:''}
      </div>
    </div>`;
  // "What the customer pays" (postpaid only) — deliberately its own card, visually
  // separate from the store's income figures below, since it's a different concept
  // entirely: what the carrier bills the customer, not what the store earns. Display and
  // tracking only — never read by any income/revenue calculation in the app.
  const monthlyPaymentCard = serviceMonthlyPaymentHtml(s);
  // "What the store earns" — kept as its own clearly-labeled card so it's never confused
  // with the customer's own monthly bill above
  const feeSection = serviceFeeSectionHtml(s);
  return `<div class="service-card">
    <div class="service-card-head">
      <div>
        <div style="font-weight:800;">${t('type.'+s.type)} · ${escapeHtml(s.carrier||'—')}</div>
        <div class="muted" style="font-size:12px;margin-top:2px;">${[s.plan?escapeHtml(s.plan):'', s.number?escapeHtml(s.number):'', s.simType==='esim'?'eSIM':t('opt.physical')].filter(Boolean).join(' · ')}</div>
      </div>
      <div style="text-align:right;">
        <span class="pill ${statusPillClass(st)}">${t('status.'+st)}</span>${(()=>{ const l = planLengthLabel(s); return l ? `<span class="plan-tag ${l[0]}">${escapeHtml(l[1])}</span>` : ''; })()}
        ${isServiceCurrentlyFrozen(s) ? `<span class="pill" style="background:#DBEAFE;color:#1D4ED8;margin-left:4px;">🧊 ${t('freeze.frozen')}</span>` : ''}
        <button class="btn btn-sm btn-ghost" data-edit-order="${s.id}" style="margin-left:6px;" title="${LANG==='zh'?'编辑套餐详情（价格、已收款、日期…）':'Edit plan details (price, received, dates…)'}">${t('btn.editRecord')}</button>
        <div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end;">
          ${(s.type==='prepaid' && s.durationDays===90) ? `<button class="btn btn-sm btn-ghost" data-print-service="${s.id}" style="color:var(--orange);">${pfBtnIcon('print')}${t('btn.print')}</button>` : ''}
        </div>
      </div>
    </div>
    ${s.expiryDate?`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap;">
      <div>
        <div class="muted" style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;">${t('detail.planStarted')}</div>
        <div style="font-size:15px;font-weight:800;">${fmtDateHuman(s.activationDate)}</div>
      </div>
      <div style="flex:1;text-align:center;color:var(--text-soft);font-size:13px;">→</div>
      <div style="text-align:right;">
        <div class="muted" style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;">${t('detail.planEnds')}</div>
        <div style="font-size:15px;font-weight:800;">${fmtDateHuman(s.expiryDate)}</div>
      </div>
    </div>
    <div class="progress-bar" style="margin-top:8px;"><div class="progress-fill ${progressStateClass(s)}" style="width:${progressPct}%"></div></div>
    <div class="muted" style="font-size:11.5px;margin-top:6px;">${contractStatusText}</div>`:''}
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">
      ${identityCard}
      ${monthlyPaymentCard}
      ${feeSection}
    </div>
  </div>`;
}
/* compact read-only row for a subscription that has been superseded or cancelled */
function historyItemHtml(s){
  const typeLabel = s.type==='postpaid' ? t('opt.postpaidShort') : t('opt.prepaidShort');
  const reasonLabel = t('reason.'+(s.changeReason||'other'));
  return `<div class="service-card" style="opacity:.88;">
    <div class="service-card-head">
      <div>
        <div style="font-weight:800;">${typeLabel} · ${escapeHtml(s.plan||s.carrier||'—')}</div>
        <div class="muted" style="font-size:12px;margin-top:2px;">${escapeHtml(s.carrier||'')} ${s.number?'· '+s.number:''}</div>
      </div>
      <div style="text-align:right;display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">
        <span class="pill pill-gray">${reasonLabel}</span>
        ${s.type==='prepaid' ? `<button class="btn btn-sm btn-ghost" data-print-service="${s.id}" title="${t('btn.print')}">${pfBtnIcon('print')}</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-edit-order="${s.id}">${t('btn.editRecord')}</button>
      </div>
    </div>
    <div class="muted" style="font-size:12px;margin-top:8px;font-weight:600;">${fmtDateHuman(s.activationDate)} → ${fmtDateHuman(s.endedAt||s.expiryDate)}</div>
    <div class="kv-grid" style="margin-top:10px;">
      <div><div class="k">${t('f.sellingPrice')}</div><div class="v">${fmtWon(s.sellingPrice||s.monthlyFee)}</div></div>
      <div><div class="k">${t('f.cancelReason')}</div><div class="v">${reasonLabel}</div></div>
    </div>
  </div>`;
}
/* Same visual language as historyItemHtml above, for the one non-service event type that
   also belongs in this timeline: a completed ID change. */
function idChangeHistoryItemHtml(req){
  return `<div class="service-card" style="opacity:.88;">
    <div class="service-card-head">
      <div>
        <div style="font-weight:800;">📄 ${t('rem.idChange.completedTitle')}</div>
        <div class="muted" style="font-size:12px;margin-top:2px;">${t('rem.idChange.handledBy')} ${escapeHtml(req.handledBy||'—')}</div>
      </div>
      <div style="text-align:right;">
        <span class="pill pill-gray">${t('status.completed')}</span>
      </div>
    </div>
    <div class="muted" style="font-size:12px;margin-top:8px;font-weight:600;">${t('rem.idChange.completedOn')} ${fmtDateHuman(req.completedDate||req.requestedDate)}</div>
    ${req.newIdNumber ? `<div class="muted" style="font-size:12px;margin-top:4px;">${req.previousIdNumber ? `${escapeHtml(req.previousIdNumber)} → ` : ''}<b>${escapeHtml(req.newIdNumber)}</b></div>` : ''}
  </div>`;
}

/* ---------------- ORDER / SERVICE modal ---------------- */
let editingOrderId = null;
let orderModalOpening = false;
/* Sets a <select> to a stored value even when that value isn't one of the current options
   (old/imported data). Without this the browser silently selects nothing, and the next save
   writes a blank or a default over the customer's real value. */
function setSelectPreserving(el, value){
  if(!el) return;
  [...el.options].filter(o=>o.dataset.legacy==='1').forEach(o=>o.remove()); // from a previous opening
  const v = value==null ? '' : String(value);
  if(v && ![...el.options].some(o=>o.value===v)){
    const o = document.createElement('option'); o.value = v; o.textContent = v; o.dataset.legacy = '1';
    el.appendChild(o);
  }
  el.value = v;
}
function openOrderModal(service, presetCustomerId){
  editingOrderId = service ? service.id : null;
  document.getElementById('orderModalTitle').textContent = service ? t('modal.editOrder') : t('modal.newOrder');
  populateStaticSelects();
  const custSel = document.getElementById('o_customer');
  // starts blank (instead of silently pre-picking the first customer in the list) so a new
  // order can't be saved onto the wrong person by accident — saving blank is already blocked
  custSel.innerHTML = `<option value="">${LANG==='zh'?'— 请选择客户 —':'— Choose customer —'}</option>` + DB.customers.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}${c.phone?' · '+escapeHtml(c.phone):''}</option>`).join('');
  custSel.value = service ? service.customerId : (presetCustomerId || '');
  document.getElementById('o_type').value = service?.type || 'prepaid';
  document.getElementById('o_plan').value = service?.plan || '';
  document.getElementById('o_number').value = service?.number || '';
  document.getElementById('o_simType').value = service?.simType || 'physical';
  document.getElementById('o_activationDate').value = service?.activationDate || todayISO();
  document.getElementById('o_durationDays').value = service?.durationDays ?? '';
  document.getElementById('o_expiryDate').value = service?.expiryDate || '';
  document.getElementById('o_status').value = service?.status || 'active';
  document.getElementById('o_monthlyFee').value = service?.monthlyFee ?? '';
  document.getElementById('o_discount').value = service?.discount ?? '';
  document.getElementById('o_firstMonthPayment').value = service?.firstMonthPayment ?? '';
  document.getElementById('o_activationFee').value = service?.activationFee ?? '';
  document.getElementById('o_simFee').value = service?.simFee ?? '';
  document.getElementById('o_sellingPrice').value = service?.sellingPrice ?? '';
  document.getElementById('o_cost').value = service?.cost ?? '';
  document.getElementById('o_received').value = service?.received ?? '';
  setSelectPreserving(document.getElementById('o_paymentMethod'), service?.paymentMethod || '');
  document.getElementById('o_commission').value = service?.commission ?? '';
  document.getElementById('o_notes').value = service?.notes || '';
  document.getElementById('o_expectedProfit').value = service?.expectedProfit ?? '';
  document.getElementById('o_actualProfit').value = service?.actualProfit ?? '';
  document.getElementById('o_usimFee').value = service?.usimFee ?? '';
  document.getElementById('o_discountPerMonth').value = service?.discountPerMonth ?? '';
  document.getElementById('o_discountMonths').value = service?.discountMonths ?? '';
  // populate the company/partner/carrier dropdowns' options BEFORE assigning their value,
  // otherwise setting .value on a still-empty <select> silently does nothing
  populatePostpaidOptionSelects('o_');
  document.getElementById('o_company').value = service?.company || '';
  document.getElementById('o_partnerCompany').value = service?.partnerCompany || '';
  // "Carrier" and "Carrier Type" were merged into a single tile-radio field, used for both
  // prepaid and postpaid — matching the same 6-option set used everywhere else in the app
  renderTileRadioGroup('o_carrierType_group', POSTPAID_CARRIER_TYPES, service?.svcCarrierType || service?.carrier || '');
  // postpaid contract-length quick picker — guess the closest real option from existing duration
  const rawDays = service?.durationDays || POSTPAID_CONTRACT_DAYS[0];
  const guessedDays = POSTPAID_CONTRACT_DAYS.reduce((best,v)=> Math.abs(v-rawDays)<Math.abs(best-rawDays)?v:best, POSTPAID_CONTRACT_DAYS[0]);
  document.getElementById('o_planDuration').value = String(guessedDays);
  // While the modal is being filled in, updateOrderTypeUI() must NOT push the picker's
  // rounded 245/365 value into Duration — that silently rewrote the contract length and
  // erased frozen days on any postpaid that was opened here and saved.
  orderModalOpening = !!service;
  // "used days" is informational only — computed from activation date, not stored
  if(service && service.type==='postpaid' && service.activationDate){
    document.getElementById('o_usedDaysField').style.display = '';
    document.getElementById('o_usedDaysDisplay').value = Math.max(0, daysBetween(service.activationDate, todayISO()));
  } else {
    document.getElementById('o_usedDaysField').style.display = 'none';
  }
  updateOrderTypeUI();
  orderModalOpening = false;
  document.getElementById('orderModalOverlay').classList.add('show');
}
document.getElementById('o_type').addEventListener('change', updateOrderTypeUI);
document.getElementById('o_planDuration').addEventListener('change', applyPlanDurationToDays);
function updateOrderTypeUI(){
  const type = document.getElementById('o_type').value;
  const isPostpaid = type === 'postpaid';
  const isPrepaid = type === 'prepaid';
  document.getElementById('o_planDurationField').style.display = isPostpaid ? '' : 'none';
  document.getElementById('o_companyField').style.display = isPostpaid ? '' : 'none';
  document.getElementById('o_partnerCompanyField').style.display = isPostpaid ? '' : 'none';
  if(isPostpaid){ populatePostpaidOptionSelects('o_'); if(!orderModalOpening) applyPlanDurationToDays(); }

  // prepaid is a flat one-time payment (just a price); postpaid now tracks expected/actual
  // profit + discount instead of the old cost/received/commission model — only "other"
  // transactional types (porting/transfer/topup/cancel) still use the full generic fee grid
  const fullFeeFields = ['o_monthlyFeeField','o_discountField','o_firstMonthPaymentField','o_activationFeeField','o_simFeeField','o_costField','o_receivedField','o_paymentMethodField','o_commissionField'];
  const showFullFees = !isPrepaid && !isPostpaid;
  fullFeeFields.forEach(id=> document.getElementById(id).style.display = showFullFees ? '' : 'none');
  document.getElementById('o_feeInfoTitle').style.display = showFullFees ? '' : 'none';
  document.getElementById('o_paymentHr').style.display = showFullFees ? '' : 'none';
  document.getElementById('o_paymentInfoTitle').style.display = (showFullFees || isPrepaid) ? '' : 'none';
  document.getElementById('o_sellingPriceField').style.display = (showFullFees || isPrepaid) ? '' : 'none';
  document.getElementById('o_sellingPriceLabel').textContent = isPrepaid ? t('f.price') : t('f.sellingPrice');
  document.getElementById('o_expectedProfitField').style.display = isPostpaid ? '' : 'none';
  document.getElementById('o_actualProfitField').style.display = isPostpaid ? '' : 'none';
  document.getElementById('o_usimFeeField').style.display = isPostpaid ? '' : 'none';
  document.getElementById('o_discountPerMonthField').style.display = isPostpaid ? '' : 'none';
  document.getElementById('o_discountMonthsField').style.display = isPostpaid ? '' : 'none';
}
function applyPlanDurationToDays(){
  const days = Number(document.getElementById('o_planDuration').value) || POSTPAID_CONTRACT_DAYS[0];
  document.getElementById('o_durationDays').value = days;
  autoCalcExpiry();
}
document.getElementById('o_durationDays').addEventListener('input', autoCalcExpiry);
document.getElementById('o_activationDate').addEventListener('input', autoCalcExpiry);
function autoCalcExpiry(){
  const start = document.getElementById('o_activationDate').value;
  const dur = Number(document.getElementById('o_durationDays').value);
  if(start && dur){
    const d = new Date(start); d.setDate(d.getDate()+dur);
    document.getElementById('o_expiryDate').value = d.toISOString().slice(0,10);
  }
}
function saveOrderFromForm(){
  const customerId = document.getElementById('o_customer').value;
  if(!customerId){ toast(LANG==='zh'?'请选择客户':'Please select a customer'); return; }
  const type = document.getElementById('o_type').value;
  const sellingPrice = Number(document.getElementById('o_sellingPrice').value)||0;
  const data = {
    customerId,
    type,
    carrier:document.getElementById('o_carrierType_group').dataset.selected || '',
    plan:document.getElementById('o_plan').value.trim(),
    number:document.getElementById('o_number').value.trim(),
    simType:document.getElementById('o_simType').value,
    activationDate:document.getElementById('o_activationDate').value,
    durationDays:Number(document.getElementById('o_durationDays').value)||0,
    expiryDate:document.getElementById('o_expiryDate').value,
    status:document.getElementById('o_status').value,
    monthlyFee:Number(document.getElementById('o_monthlyFee').value)||0,
    discount:Number(document.getElementById('o_discount').value)||0,
    firstMonthPayment:Number(document.getElementById('o_firstMonthPayment').value)||0,
    activationFee:Number(document.getElementById('o_activationFee').value)||0,
    simFee:Number(document.getElementById('o_simFee').value)||0,
    // prepaid is paid in full at signup — there's no partial-payment concept, so "received"
    // always matches the price rather than being entered separately
    sellingPrice, cost:Number(document.getElementById('o_cost').value)||0,
    received: type==='prepaid' ? sellingPrice : Number(document.getElementById('o_received').value)||0,
    paymentMethod:document.getElementById('o_paymentMethod').value,
    commission:Number(document.getElementById('o_commission').value)||0,
    notes:document.getElementById('o_notes').value.trim(),
    company: type==='postpaid' ? document.getElementById('o_company').value : '',
    partnerCompany: type==='postpaid' ? document.getElementById('o_partnerCompany').value : '',
    svcCarrierType: document.getElementById('o_carrierType_group').dataset.selected || '',
    expectedProfit: type==='postpaid' ? Number(document.getElementById('o_expectedProfit').value)||0 : 0,
    actualProfit: type==='postpaid' ? Number(document.getElementById('o_actualProfit').value)||0 : 0,
    usimFee: type==='postpaid' ? Number(document.getElementById('o_usimFee').value)||0 : 0,
    discountPerMonth: type==='postpaid' ? Number(document.getElementById('o_discountPerMonth').value)||0 : 0,
    discountMonths: type==='postpaid' ? Number(document.getElementById('o_discountMonths').value)||0 : 0,
  };
  if(editingOrderId){
    // editing an existing record just corrects its details — it doesn't change which
    // subscription is active, so this never touches the isActive/history mechanism
    Object.assign(getService(editingOrderId), data);
  } else if(isSubscriptionType(data.type)){
    // creating a NEW prepaid/postpaid record always goes through setActiveSubscription,
    // so it's structurally impossible to end up with two active subscriptions for the
    // same customer, no matter which screen/button was used to get here (requirement #7)
    const prevActive = activeSubscriptionFor(customerId);
    let reason = 'new';
    if(prevActive){
      reason = (prevActive.type==='prepaid' && data.type==='postpaid') ? 'upgraded_to_postpaid' : 'plan_change';
    }
    setActiveSubscription(customerId, data, reason);
  } else {
    // porting / transfer / topup / cancel-log entries are just transactional records,
    // not competing subscriptions, so they're simply appended as before
    data.id = uid('s');
    data.isActive = false;
    DB.services.push(data);
  }
  saveDB(DB);
  closeAllModals();
  toast(t('toast.orderSaved'));
  if(detailCustomerId){ openCustomerDetail(detailCustomerId); }
  renderPage(currentPage);
  renderNav();
}

/* ---------------- CHANGE SUBSCRIPTION (Change to Postpaid / Change Plan) ---------------- */
let changeSubCustomerId = null;
let changeSubMode = null; // 'to_postpaid' | 'plan_change'
function planLabel(svc){
  if(!svc) return '';
  const typeLabel = svc.type==='postpaid' ? t('opt.postpaidShort') : t('opt.prepaidShort');
  return `${typeLabel}${svc.plan?' · '+escapeHtml(svc.plan):''}${svc.carrier?' · '+escapeHtml(svc.carrier):''}`;
}
/* Freeze SIM (postpaid only) — pauses the contract clock for a chosen stretch of time.
   The frozen period doesn't count toward the contract, so the expiry date pushes back by
   exactly however many days end up frozen: an 8-month contract with a 2-month freeze in
   the middle still delivers a full 8 months of actual active service, just spread across
   10 real-world months instead of 8. */
let freezeCustomerId = null;
let freezeMode = 'days';
function openFreezeSimModal(customerId){
  freezeCustomerId = customerId;
  freezeMode = 'days';
  const svc = activeSubscriptionFor(customerId);
  const usedDays = totalFrozenDaysUsed(svc);
  const remaining = Math.max(0, MAX_FREEZE_DAYS - usedDays);
  document.getElementById('freezeAllowanceNote').textContent =
    (LANG==='zh'
      ? `本合约可用暂停天数：${remaining} 天（上限 ${MAX_FREEZE_DAYS} 天，已使用 ${usedDays} 天）`
      : `Freeze days available on this contract: ${remaining} (of ${MAX_FREEZE_DAYS} max, ${usedDays} already used)`);
  document.getElementById('fz_startDate').value = todayISO();
  document.getElementById('fz_days').value = '';
  document.getElementById('fz_rangeStart').value = todayISO();
  document.getElementById('fz_rangeEnd').value = '';
  document.getElementById('freezeModeDays').classList.add('active');
  document.getElementById('freezeModeRange').classList.remove('active');
  document.getElementById('freezeDaysPane').style.display = '';
  document.getElementById('freezeRangePane').style.display = 'none';
  updateFreezePreview();
  document.getElementById('freezeSimModalOverlay').classList.add('show');
}
function getFreezeModalDates(){
  if(freezeMode==='days'){
    const start = document.getElementById('fz_startDate').value;
    const days = Number(document.getElementById('fz_days').value)||0;
    if(!start || days<1) return null;
    const end = new Date(start); end.setDate(end.getDate()+days-1);
    return {startDate: start, endDate: end.toISOString().slice(0,10), days};
  } else {
    const start = document.getElementById('fz_rangeStart').value;
    const end = document.getElementById('fz_rangeEnd').value;
    if(!start || !end || end<start) return null;
    return {startDate: start, endDate: end, days: daysBetween(start,end)+1};
  }
}
function updateFreezePreview(){
  const box = document.getElementById('freezePreview');
  const svc = activeSubscriptionFor(freezeCustomerId);
  const range = getFreezeModalDates();
  if(!range){ box.textContent = ''; return; }
  const usedDays = totalFrozenDaysUsed(svc);
  const remaining = MAX_FREEZE_DAYS - usedDays;
  if(range.days > remaining){
    box.style.color = 'var(--red)';
    box.textContent = LANG==='zh'
      ? `超出可用天数（最多还可暂停 ${remaining} 天）`
      : `Exceeds available freeze days (max ${remaining} more allowed)`;
    return;
  }
  const newExpiry = new Date(svc.expiryDate); newExpiry.setDate(newExpiry.getDate()+range.days);
  box.style.color = 'var(--text)';
  box.textContent = LANG==='zh'
    ? `${fmtDateHuman(range.startDate)} → ${fmtDateHuman(range.endDate)}（共 ${range.days} 天）。合约到期日将顺延至 ${fmtDateHuman(newExpiry.toISOString().slice(0,10))}`
    : `${fmtDateHuman(range.startDate)} → ${fmtDateHuman(range.endDate)} (${range.days} days). Contract end date will push back to ${fmtDateHuman(newExpiry.toISOString().slice(0,10))}`;
}
document.querySelectorAll('[data-freeze-mode]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    freezeMode = btn.dataset.freezeMode;
    document.getElementById('freezeModeDays').classList.toggle('active', freezeMode==='days');
    document.getElementById('freezeModeRange').classList.toggle('active', freezeMode==='range');
    document.getElementById('freezeDaysPane').style.display = freezeMode==='days' ? '' : 'none';
    document.getElementById('freezeRangePane').style.display = freezeMode==='range' ? '' : 'none';
    updateFreezePreview();
  });
});
['fz_startDate','fz_days','fz_rangeStart','fz_rangeEnd'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updateFreezePreview);
});
document.getElementById('freezeModalClose').addEventListener('click', closeAllModals);
document.getElementById('freezeModalCancel').addEventListener('click', closeAllModals);
document.getElementById('freezeModalSave').addEventListener('click', ()=>{
  const svc = activeSubscriptionFor(freezeCustomerId);
  const range = getFreezeModalDates();
  if(!range){ toast(LANG==='zh'?'请填写有效的日期/天数':'Please enter valid dates/days'); return; }
  const usedDays = totalFrozenDaysUsed(svc);
  if(range.days > MAX_FREEZE_DAYS - usedDays){
    toast(LANG==='zh'?'超出该合约的可用暂停天数':'This exceeds the freeze days available on this contract');
    return;
  }
  svc.freezes = svc.freezes || [];
  svc.freezes.push({startDate: range.startDate, endDate: range.endDate});
  // the frozen stretch doesn't count toward the contract, so both the expiry date and the
  // nominal contract length push back by exactly the number of days frozen
  const newExpiry = new Date(svc.expiryDate); newExpiry.setDate(newExpiry.getDate()+range.days);
  svc.expiryDate = newExpiry.toISOString().slice(0,10);
  svc.durationDays = (Number(svc.durationDays)||0) + range.days;
  saveDB(DB);
  closeAllModals();
  toast(t('toast.freezeSaved'));
  openCustomerDetail(freezeCustomerId);
  renderNav();
});
function unfreezeSim(customerId, refreshProfile){
  const svc = activeSubscriptionFor(customerId);
  const freeze = currentFreezeFor(svc);
  if(!freeze) return;
  const today = todayISO();
  const originalDays = daysBetween(freeze.startDate, freeze.endDate)+1;
  // Ending early means fewer days actually ended up frozen than planned — the contract
  // extension has to shrink to match, or the customer would end up with extra "free" days
  // added that they never actually lost.
  if(today <= freeze.startDate){
    // never actually started - remove entirely, nothing to shrink
    svc.freezes = svc.freezes.filter(f=>f!==freeze);
    const newExpiry = new Date(svc.expiryDate); newExpiry.setDate(newExpiry.getDate()-originalDays);
    svc.expiryDate = newExpiry.toISOString().slice(0,10);
    svc.durationDays = Math.max(0, (Number(svc.durationDays)||0) - originalDays);
  } else {
    const actualDays = daysBetween(freeze.startDate, today); // ends the day before today
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
    freeze.endDate = yesterday.toISOString().slice(0,10);
    const shrinkBy = originalDays - actualDays;
    const newExpiry = new Date(svc.expiryDate); newExpiry.setDate(newExpiry.getDate()-shrinkBy);
    svc.expiryDate = newExpiry.toISOString().slice(0,10);
    svc.durationDays = Math.max(0, (Number(svc.durationDays)||0) - shrinkBy);
  }
  saveDB(DB);
  toast(t('toast.unfreezeSaved'));
  // Only reopens the profile modal when called FROM the profile (its default) — calling
  // this from Sheet View with refreshProfile=false avoids popping the profile open over
  // whatever the person was actually looking at, since they never asked to see it.
  if(refreshProfile!==false) openCustomerDetail(customerId);
  renderNav();
}
/* Tracks a customer's request to switch their registered ID from Passport to a Korean
   Resident Card (ARC) — needed for many everyday Korean apps (banking, delivery, etc.)
   that require ARC rather than passport for verification. Kept as its own small, direct
   flow — separate from the general "info_change" auto-signal — specifically so staff can
   record exactly who's handling it and when it was asked for, and so it shows up as a
   trackable task with an owner, not just a passive signal. */
let idChangeCustomerId = null;
/* The ID change modal's markup (idc_date, idc_handler_group) lives in index.html as a fixed
   form — there's no ARC number field there yet, and adding one means touching the HTML file
   directly, which isn't available to patch from here. Instead, this builds the field once at
   runtime and inserts it right before the "handled by" picker, so it looks and behaves like a
   normal part of the form without needing an index.html change. Safe to call every time the
   modal opens — it's a no-op after the first call since it checks for the field first. */
function ensureArcNumberField(){
  if(document.getElementById('idc_arcNumber')) return;
  const handlerGroup = document.getElementById('idc_handler_group');
  if(!handlerGroup || !handlerGroup.parentElement) return;
  const wrapper = document.createElement('div');
  wrapper.style.marginBottom = '14px';
  wrapper.innerHTML = `
    <label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;">${t('f.idNumber')} (ARC)</label>
    <input type="text" id="idc_arcNumber" placeholder="123456-1234567" maxlength="14"
      style="width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:14px;">
  `;
  handlerGroup.parentElement.insertBefore(wrapper, handlerGroup);
  // Same auto-dash formatting as the main profile form's ARC number field (6 digits, dash, 7 digits)
  document.getElementById('idc_arcNumber').addEventListener('input', e=>{
    let digits = e.target.value.replace(/[^0-9]/g,'').slice(0,13);
    e.target.value = digits.length>6 ? digits.slice(0,6)+'-'+digits.slice(6) : digits;
    idChangeAgeWarn();
  });
}
function openIdChangeModal(customerId){
  idChangeCustomerId = customerId;
  document.getElementById('idc_date').value = todayISO();
  renderTileRadioGroup('idc_handler_group', STAFF_MEMBERS, '');
  ensureArcNumberField();
  // Pre-fill with their current ID number only if they're already ARC (e.g. re-opening this
  // after a correction) — for the normal Passport → ARC case this starts blank, since the new
  // ARC number is genuinely new information staff need to type in from the card itself.
  const cust = getCustomer(customerId);
  document.getElementById('idc_arcNumber').value = (cust && cust.idType==='ARC') ? (cust.idNumber||'') : '';
  idChangeAgeWarn();
  document.getElementById('idChangeModalOverlay').classList.add('show');
}
document.getElementById('idChangeModalClose').addEventListener('click', closeAllModals);
document.getElementById('idChangeModalCancel').addEventListener('click', closeAllModals);
/* Shared by both the plain "Save" and "Save & Print" buttons — validates and writes the
   request, returning the customer id on success (or null if validation failed) so the
   print button can chain straight into printIdChangeForm() without duplicating this logic. */
function saveIdChangeRequest(){
  // Previously this created a "pending" request that had to be separately marked complete
  // later — a two-step flow that turned out to be more than staff actually needed. Now
  // picking a date and saving immediately records the change as done on that date: no
  // pending banner, no separate "Mark complete" step, no chance of it getting stuck pending.
  const date = document.getElementById('idc_date').value || todayISO();
  const handledBy = document.getElementById('idc_handler_group').dataset.selected;
  if(!handledBy){ toast(LANG==='zh'?'请选择经办人':'Please select who is handling this'); return null; }
  const arcNumberEl = document.getElementById('idc_arcNumber');
  const arcNumber = arcNumberEl ? arcNumberEl.value.trim().toUpperCase() : '';
  if(!arcNumber){ toast(LANG==='zh'?'请输入外国人登记证（ARC）号码':'Please enter the ARC number'); return null; }
  if(idChangeAgeWarn()){ toast(__T('Not accepted: customer is under 19')); return null; } // ARC change only from age 19
  const cust = getCustomer(idChangeCustomerId);
  const previousIdNumber = cust.idNumber || '';
  cust.idChangeRequest = {requestedDate: date, handledBy, status:'completed', completedDate: date, previousIdNumber, newIdNumber: arcNumber};
  cust.idType = 'ARC'; // the whole point of this — reflect the actual outcome right away
  cust.idNumber = arcNumber; // swap the stored ID number from the old passport number to the new ARC number
  saveDB(DB);
  toast(t('toast.idChangeCompleted'));
  renderNav();
  return idChangeCustomerId;
}
/* Shared by the profile banner's "Mark complete" and the Reminders tab's version of the same
   button. Guards against cust.idChangeRequest having gone missing between when this button was
   rendered and when it was clicked — which used to crash with "Cannot set properties of
   undefined" and, worse, silently ate the click with no explanation. This can genuinely happen
   if the on-screen banner/row is stale (e.g. a background sync refreshed the underlying data
   without re-rendering an open modal) or if the request was never actually saved server-side
   in the first place on a server whose database is missing the id_change_request column —
   see schema.sql. Either way, failing loudly with a toast (and telling the person to re-open
   the customer / retry) is far better than a dead click or a JS crash. */
function completeIdChangeRequest(customerId, onDone){
  const cust = getCustomer(customerId);
  if(!cust || !cust.idChangeRequest){
    toast(LANG==='zh'
      ? '找不到该证件变更申请（可能已刷新丢失）— 请重新打开客户资料并重新申请'
      : 'Could not find that ID change request (it may have been lost on refresh) — please reopen this customer and submit it again');
    if(onDone) onDone();
    return false;
  }
  cust.idChangeRequest.status = 'completed';
  cust.idChangeRequest.completedDate = todayISO(); // so it's possible to actually answer "when did this happen" later, not just "when was it asked for"
  cust.idType = 'ARC'; // the whole point of this request — reflect the actual outcome once it's done
  saveDB(DB);
  toast(t('toast.idChangeCompleted'));
  if(onDone) onDone();
  return true;
}
document.getElementById('idChangeModalSave').addEventListener('click', ()=>{
  const savedId = saveIdChangeRequest();
  if(!savedId) return;
  closeAllModals();
  openCustomerDetail(savedId);
});
document.getElementById('idChangeModalSavePrint').addEventListener('click', ()=>{
  const savedId = saveIdChangeRequest();
  if(!savedId) return;
  closeAllModals();
  printIdChangeForm(savedId);
});
function openChangeSubModal(customerId, mode){
  const cust = getCustomer(customerId);
  const current = activeSubscriptionFor(customerId);
  if(!cust) return;
  changeSubCustomerId = customerId;
  changeSubMode = mode;
  document.getElementById('changeSubModalTitle').textContent = mode==='to_postpaid' ? t('modal.changeToPostpaid') : t('modal.changePlan');
  document.getElementById('changeSubCurrentPlan').innerHTML = current
    ? `${t('detail.currentPlan')}: <b>${planLabel(current)}</b>`
    : `<i>${t('detail.noActiveSubscription')}</i>`;

  // auto-fill everything already known about this existing customer — they're not a new
  // signup, just switching plan type, so there's no reason to make staff retype this
  document.getElementById('cs_name').value = cust.name || '';
  document.getElementById('cs_nationality').value = cust.nationality || '';
  document.getElementById('cs_number').value = current?.number || cust.phone || '';
  document.getElementById('cs_occupation').value = cust.occupation || '';
  document.getElementById('cs_idNumber').value = cust.idNumber || '';
  // ARC only for this flow — a customer already in the store's system converting to
  // postpaid is essentially always ARC-eligible; Passport isn't offered here
  renderCompactOptionField('cs_idType_group', ['ARC'], 'ARC', t('f.idType'));

  renderCompactOptionField('cs_workType_group', POSTPAID_WORK_TYPES, current?.workType || cust.workType || '신규가입', t('f.workType'));
  renderCompactOptionField('cs_contractLength_group', POSTPAID_CONTRACT_DAYS.map(String),
    current?.durationDays ? String(POSTPAID_CONTRACT_DAYS.reduce((b,v)=>Math.abs(v-current.durationDays)<Math.abs(b-current.durationDays)?v:b,POSTPAID_CONTRACT_DAYS[0])) : String(POSTPAID_CONTRACT_DAYS[0]),
    t('f.contractLength'));
  renderCompactOptionField('cs_company_group', POSTPAID_COMPANIES, current?.company || '', t('f.company'));
  renderCompactOptionField('cs_partnerCompany_group', POSTPAID_PARTNER_COMPANIES, current?.partnerCompany || '', t('f.partnerCompany'));
  renderCompactOptionField('cs_svcCarrierType_group', POSTPAID_CARRIER_TYPES, current?.svcCarrierType || '', t('f.svcCarrierType'));

  // genuinely new information for this signup — left blank for staff to fill in
  renderPostpaidPlanTiles('cs_plan_group', '');
  document.getElementById('cs_activationDate').value = todayISO();
  document.getElementById('cs_monthlyFee').value = '';
  renderTileRadioGroup('cs_handlerName_group', STAFF_MEMBERS, getActiveStaff());
  document.getElementById('cs_expectedProfit').value = '';
  document.getElementById('cs_usimFee').value = '';
  document.getElementById('cs_discountPerMonth').value = '';
  document.getElementById('cs_discountMonths').value = '';
  document.getElementById('cs_netExpectedPreview').value = '';
  document.getElementById('cs_notes').value = '';
  document.getElementById('changeSubModalOverlay').classList.add('show');
}
function updateCsNetExpectedPreview(){
  const expected = Number(document.getElementById('cs_expectedProfit').value)||0;
  const usimFee = Number(document.getElementById('cs_usimFee').value)||0;
  const perMonth = Number(document.getElementById('cs_discountPerMonth').value)||0;
  const months = Number(document.getElementById('cs_discountMonths').value)||0;
  document.getElementById('cs_netExpectedPreview').value = fmtWon(Math.max(0, expected - (perMonth*months) - usimFee));
}
['cs_expectedProfit','cs_usimFee','cs_discountPerMonth','cs_discountMonths'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updateCsNetExpectedPreview);
});
document.getElementById('saveChangeSubBtn').addEventListener('click', ()=>{
  if(!changeSubCustomerId) return;
  const workType = document.getElementById('cs_workType_group').dataset.selected;
  if(!workType){ toast(LANG==='zh'?'请选择「业务向」':'Please select a work type'); return; }
  const cust = getCustomer(changeSubCustomerId);
  // the auto-filled identity fields are editable, so save any corrections back onto the
  // customer record itself — not just the new service
  cust.name = document.getElementById('cs_name').value.trim() || cust.name;
  cust.nationality = document.getElementById('cs_nationality').value.trim().toUpperCase() || cust.nationality;
  cust.phone = document.getElementById('cs_number').value.trim() || cust.phone;
  cust.occupation = document.getElementById('cs_occupation').value.trim();
  cust.idNumber = document.getElementById('cs_idNumber').value.trim();
  cust.idType = document.getElementById('cs_idType_group').dataset.selected || 'ARC';
  cust.workType = workType;

  const contractLength = Number(document.getElementById('cs_contractLength_group').dataset.selected || POSTPAID_CONTRACT_DAYS[0]);
  const company = document.getElementById('cs_company_group').dataset.selected || '';
  const partnerCompany = document.getElementById('cs_partnerCompany_group').dataset.selected || '';
  const svcCarrierType = document.getElementById('cs_svcCarrierType_group').dataset.selected || '';
  const activationDate = document.getElementById('cs_activationDate').value || todayISO();
  const d = new Date(activationDate); d.setDate(d.getDate()+contractLength);
  const svcData = {
    customerId: changeSubCustomerId, type:'postpaid',
    carrier: svcCarrierType,
    plan: document.getElementById('cs_plan_group').dataset.selected || '',
    number: document.getElementById('cs_number').value.trim(),
    simType:'physical', activationDate, durationDays: contractLength,
    expiryDate: d.toISOString().slice(0,10), status:'active',
    monthlyFee: Number(document.getElementById('cs_monthlyFee').value)||0,
    discount:0,
    expectedProfit: Number(document.getElementById('cs_expectedProfit').value)||0,
    actualProfit: 0,
    usimFee: Number(document.getElementById('cs_usimFee').value)||0,
    discountPerMonth: Number(document.getElementById('cs_discountPerMonth').value)||0,
    discountMonths: Number(document.getElementById('cs_discountMonths').value)||0,
    firstMonthPayment:0, activationFee:0, simFee:0,
    sellingPrice:0, cost:0, received:0, paymentMethod: '', commission:0,
    notes:document.getElementById('cs_notes').value.trim(),
    company, partnerCompany, svcCarrierType,
  };
  const reason = changeSubMode==='to_postpaid' ? 'upgraded_to_postpaid' : 'plan_change';
  setActiveSubscription(changeSubCustomerId, svcData, reason);
  saveDB(DB);
  closeAllModals();
  toast(t('toast.orderSaved'));
  openCustomerDetail(changeSubCustomerId);
  renderPage(currentPage);
  renderNav();
});

/* ---------------- RECHARGE / CHANGE TO PREPAID (shared modal) ---------------- */
let prepaidAssignCustomerId = null;
let prepaidAssignMode = null; // 'recharge' | 'to_prepaid'
function openPrepaidAssignModal(customerId, mode){
  const cust = getCustomer(customerId);
  const current = activeSubscriptionFor(customerId);
  if(!cust) return;
  prepaidAssignCustomerId = customerId;
  prepaidAssignMode = mode;
  document.getElementById('prepaidAssignModalTitle').textContent = mode==='recharge' ? t('btn.recharge') : t('btn.changeToPrepaid');
  document.getElementById('savePrepaidAssignBtn').textContent = mode==='recharge' ? t('btn.confirmRecharge') : t('btn.confirmChange');
  document.getElementById('prepaidAssignCurrentPlan').innerHTML = current
    ? `${t('detail.currentPlan')}: <b>${planLabel(current)}</b>`
    : `<i>${t('detail.noActiveSubscription')}</i>`;

  const plansForMode = mode==='recharge' ? RECHARGE_PLAN : PREPAID_PLANS;
  renderPrepaidPlanTiles(String(plansForMode[0].days), 'pa_prepaidPlan_group', plansForMode);
  document.getElementById('pa_activationDate').value = todayISO();
  // carries over the same physical SIM by default (recharging usually means "keep using
  // what they have"), and the same company/carrier they were already on — staff can still
  // change either if this is actually a new SIM or a different deal
  document.getElementById('pa_usimNumber').value = current?.usimNumber || '';
  document.getElementById('pa_discount').value = '0';
  updatePrepaidAssignPriceFromPlan();
  document.getElementById('pa_notes').value = '';
  renderTileRadioGroup('pa_paymentMethod_group', PAYMENT_METHODS, PAYMENT_METHODS.includes(current?.paymentMethod) ? current.paymentMethod : '');
  updateCurrencyBadgeFor('pa_paymentMethod_group');
  document.getElementById('prepaidAssignModalOverlay').classList.add('show');
}
function updatePrepaidAssignPriceFromPlan(){
  const plansForMode = prepaidAssignMode==='recharge' ? RECHARGE_PLAN : PREPAID_PLANS;
  const days = Number(document.getElementById('pa_prepaidPlan_group').dataset.selected)||plansForMode[0].days;
  const plan = plansForMode.find(p=>p.days===days);
  document.getElementById('pa_price').value = plan ? plan.price : '';
  const {companies, carriers} = prepaidCompanyCarrierOptionsFor(days);
  const current = activeSubscriptionFor(prepaidAssignCustomerId);
  const curCompany = document.getElementById('pa_company_group').dataset.selected || current?.company || '';
  const curCarrier = document.getElementById('pa_svcCarrierType_group').dataset.selected || current?.svcCarrierType || '';
  renderTileRadioGroup('pa_company_group', companies, companies.includes(curCompany) ? curCompany : '');
  renderTileRadioGroup('pa_svcCarrierType_group', carriers, carriers.includes(curCarrier) ? curCarrier : '');
  updatePrepaidAssignFinalPricePreview();
}
function updatePrepaidAssignFinalPricePreview(){
  const price = Number(document.getElementById('pa_price').value)||0;
  const discount = Number(document.getElementById('pa_discount').value)||0;
  document.getElementById('pa_finalPricePreview').value = fmtWon(Math.max(0, price-discount));
}
document.getElementById('pa_prepaidPlan_group').addEventListener('click', ()=> setTimeout(updatePrepaidAssignPriceFromPlan, 0));
['pa_price','pa_discount'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updatePrepaidAssignFinalPricePreview);
});
document.getElementById('savePrepaidAssignBtn').addEventListener('click', ()=>{
  if(!prepaidAssignCustomerId) return;
  const cust = getCustomer(prepaidAssignCustomerId);
  const durationDays = Number(document.getElementById('pa_prepaidPlan_group').dataset.selected)||90;
  const activationDate = document.getElementById('pa_activationDate').value || todayISO();
  const price = Number(document.getElementById('pa_price').value)||0;
  const discount = Number(document.getElementById('pa_discount').value)||0;
  const finalPrice = Math.max(0, price-discount);
  const planInfo = PREPAID_PLANS.find(p=>p.days===durationDays);
  const d = new Date(activationDate); d.setDate(d.getDate()+durationDays);
  const svcData = {
    customerId: prepaidAssignCustomerId, type:'prepaid',
    carrier: document.getElementById('pa_svcCarrierType_group').dataset.selected || cust.carrierType,
    plan: durationDays===90 ? PREETI_FIXED_PLAN : (planInfo ? `${planInfo.days}일` : `${durationDays}일`),
    number: cust.phone, usimNumber: document.getElementById('pa_usimNumber').value.trim(),
    simType:'physical', activationDate, durationDays,
    expiryDate: d.toISOString().slice(0,10), status:'active',
    price, discount, sellingPrice:finalPrice, received:finalPrice, cost:0,
    monthlyFee:0, firstMonthPayment:0, activationFee:0, simFee:0, paymentMethod: document.getElementById('pa_paymentMethod_group').dataset.selected || '', commission:0,
    notes:document.getElementById('pa_notes').value.trim(),
    company: document.getElementById('pa_company_group').dataset.selected || '',
    svcCarrierType: document.getElementById('pa_svcCarrierType_group').dataset.selected || '',
  };
  const reason = prepaidAssignMode==='recharge' ? 'recharge' : 'downgraded_to_prepaid';
  setActiveSubscription(prepaidAssignCustomerId, svcData, reason);
  saveDB(DB);
  closeAllModals();
  toast(t('toast.orderSaved'));
  openCustomerDetail(prepaidAssignCustomerId);
  renderPage(currentPage);
  renderNav();
});

/* ---------------- CANCEL SUBSCRIPTION ---------------- */
let cancelSubCustomerId = null;
function openCancelSubModal(customerId){
  const current = activeSubscriptionFor(customerId);
  cancelSubCustomerId = customerId;
  document.getElementById('cancelSubCurrentPlan').innerHTML = current
    ? `${t('detail.currentPlan')}: <b>${planLabel(current)}</b>`
    : `<i>${t('detail.noActiveSubscription')}</i>`;
  document.getElementById('cs_cancelReason').value = 'cancelled';
  document.getElementById('cs_cancelNotes').value = '';
  document.getElementById('cancelSubModalOverlay').classList.add('show');
}
document.getElementById('confirmCancelSubBtn').addEventListener('click', ()=>{
  if(!cancelSubCustomerId) return;
  const reason = document.getElementById('cs_cancelReason').value;
  const notes = document.getElementById('cs_cancelNotes').value.trim();
  const ended = endActiveSubscription(cancelSubCustomerId, reason);
  if(notes) ended.forEach(s=> s.notes = (s.notes ? s.notes+' — ' : '')+notes);
  saveDB(DB);
  closeAllModals();
  toast(t('toast.subscriptionCancelled'));
  openCustomerDetail(cancelSubCustomerId);
  renderPage(currentPage);
  renderNav();
});

/* ---------------- REMINDERS ---------------- */
/* Which list a reminder belongs to. Plans more than 30 days late go to "Old" so they no
   longer bury today's work; nothing is deleted or auto-completed. */
const REM_OLD_AFTER_DAYS = 30;
function remBucket(r){
  if(r.uiStatus==='completed') return 'done';
  if(r.daysLeft===0) return 'today';
  if(r.daysLeft>0 && r.daysLeft<=7) return 'week';
  if(r.daysLeft<0 && r.daysLeft>=-REM_OLD_AFTER_DAYS) return 'overdue';
  if(r.daysLeft<-REM_OLD_AFTER_DAYS) return 'old';
  return 'later'; // 8–30 days ahead
}
/* what the sidebar badge counts: due today + this week (not overdue/old backlog) */
function remBadgeCount(){
  return buildReminders().filter(r=> r.type!=='contract_end' && (remBucket(r)==='today' || remBucket(r)==='week')).length;
}
/* "Good morning / afternoon / evening, <staff member>" for the dashboard banner */
function dashGreetingText(){
  const h = new Date().getHours();
  let who = ''; try{ who = getActiveStaff() || ''; }catch(e){}
  if(LANG==='zh') return (h<12?'早上好':h<18?'下午好':'晚上好') + (who?'，'+who:'');
  return (h<12?'Good morning':h<18?'Good afternoon':'Good evening') + (who?', '+who:'');
}
/* "Today" tiles inside the dashboard banner — each opens the matching Reminders tab */
function renderDashTodayStrip(reminders, renewalsSoon){
  const card = document.querySelector('#page-dashboard>.card:first-child'); if(!card) return;
  let strip = document.getElementById('dashTodayStrip');
  if(!strip){ strip = document.createElement('div'); strip.id = 'dashTodayStrip'; strip.className = 'dash-today'; card.appendChild(strip); }
  const n = k => reminders.filter(r=>remBucket(r)===k).length;
  const zh = LANG==='zh';
  const tiles = [
    {tab:'today', label: zh?'今天到期':'Due today', v:n('today')},
    {tab:'week', label: zh?'本周到期':'This week', v:n('week')},
    {tab:'overdue', label: zh?'已逾期':'Overdue', hint: zh?'过去30天内到期':'expired in the last 30 days', v:n('overdue')},
    {tab:'postpaidContract', label: zh?'合约即将结束':'Contracts ending', hint: zh?'后付合约30天内结束':'postpaid contracts ending in the next 30 days', v:(renewalsSoon||[]).length},
  ];
  const html = tiles.map(x=>`<button type="button" class="dash-today-tile ${x.v?'':'zero'}" data-today-tab="${x.tab}"${x.hint?` title="${escapeHtml(x.hint)}"`:''}><span class="v">${x.v}</span><span class="l">${escapeHtml(x.label)}</span></button>`).join('');
  if(strip.innerHTML!==html){
    strip.innerHTML = html;
    strip.querySelectorAll('[data-today-tab]').forEach(b=> b.addEventListener('click', ()=>{ reminderTab = b.dataset.todayTab; goTo('reminders'); }));
  }
}
function renderReminders(){
  const all = buildReminders().filter(r=>r.type!=='contract_end'); // postpaid contract status gets its own tab below — see why there
  const cohortAll = getPrepaidCohortList(); // unfiltered — used only for the tab's count badge
  const postpaidContractAll = getPostpaidContractList();
  const idChangeAll = getPendingIdChangeRequests();
  const nb = k => all.filter(r=>remBucket(r)===k).length;
  const tabs = [
    {key:'today', label:'rem.tab.today', n:nb('today')},
    {key:'week', label:'rem.tab.week', n:nb('week')},
    {key:'overdue', label:'rem.tab.overdue', n:nb('overdue')},
    {key:'all', label:'rem.tab.all', n:all.filter(r=>{ const b=remBucket(r); return b!=='done' && b!=='old'; }).length},
    {key:'old', label:'rem.tab.old', n:nb('old')},
    {key:'expiring', label:'rem.tab.expiring', n:cohortAll.length},
    {key:'postpaidContract', label:'rem.tab.postpaidContract', n:postpaidContractAll.length},
    {key:'idChange', label:'rem.tab.idChange', n:idChangeAll.length},
    {key:'infochange', label:'rem.tab.infochange', n:all.filter(r=>r.type==='info_change' && r.uiStatus!=='completed').length},
    {key:'done', label:'rem.tab.done', n:all.filter(r=>r.uiStatus==='completed').length},
  ];
  document.getElementById('reminderTabs').innerHTML = tabs.map(tb=>`<button class="chip-tab ${reminderTab===tb.key?'active':''}" data-tab="${tb.key}">${t(tb.label)} <span class="n">${tb.n}</span></button>`).join('');
  document.querySelectorAll('[data-tab]').forEach(b=> b.addEventListener('click', ()=>{ reminderTab=b.dataset.tab; renderReminders(); }));

  const filterBox = document.getElementById('reminderExpiringFilter');
  filterBox.style.display = reminderTab==='expiring' ? 'flex' : 'none';

  if(reminderTab==='expiring'){ renderExpiringCohortTab(cohortAll); return; }
  if(reminderTab==='postpaidContract'){ renderPostpaidContractTab(postpaidContractAll); return; }
  if(reminderTab==='idChange'){ renderIdChangeTab(idChangeAll); return; }

  let list = all;
  if(['today','week','overdue','old','done'].includes(reminderTab)) list = all.filter(r=>remBucket(r)===reminderTab);
  else if(reminderTab==='infochange') list = all.filter(r=>r.type==='info_change' && r.uiStatus!=='completed');
  else list = all.filter(r=>{ const b=remBucket(r); return b!=='done' && b!=='old'; });
  // overdue lists: most recently expired first (the ones still most likely to recharge)
  if(reminderTab==='overdue' || reminderTab==='old') list = [...list].sort((x,y)=> y.daysLeft - x.daysLeft);

  document.getElementById('reminderList').innerHTML = list.length ? list.map(r=>{
    const c = getCustomer(r.customerId);
    const dtxt = r.daysLeft<0 ? `${Math.abs(r.daysLeft)} ${t('rem.overdue')}` : (r.daysLeft===0? t('rem.today') : `${r.daysLeft} ${t('rem.dueIn')}`);
    const {month, day} = dateBadgeParts(r.dueDate);
    const accent = r.daysLeft<=0 ? '#DC2626' : (r.daysLeft<=7 ? '#EA580C' : '#94A3B8');
    return `<div class="rem-row" style="--accent:${accent};">
      <div class="rem-row-date">
        <div class="rem-row-date-month">${month}${LANG==='zh'?'月':'/'}</div>
        <div class="rem-row-date-day" style="color:${accent}">${day}</div>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;cursor:pointer;" data-open-customer="${c?c.id:''}">${c?escapeHtml(c.name):''} <span class="pill pill-blue" style="margin-left:4px;">${t('rem.type.'+r.type)}</span></div>
        <div class="muted" style="font-size:12px;">${escapeHtml(r.sub||'')} · ${c?escapeHtml(c.phone||''):''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto;">
        <span class="pill ${r.daysLeft<=0?'pill-red':'pill-orange'}">${dtxt}</span>
        ${c && c.phone ? `<button class="btn btn-sm btn-ghost rem-quick" data-rem-copy="${escapeHtml(c.phone)}" title="${t('rem.copyNumber')}">📋 ${t('rem.copyNumber')}</button>` : ''}
        ${c && r.uiStatus!=='completed' && r.type==='expiry' && activeSubscriptionFor(c.id)?.type==='prepaid' ? `<button class="btn btn-sm btn-ghost rem-quick" data-rem-recharge="${c.id}">🔋 ${t('btn.recharge')}</button>` : ''}
        ${c ? `<button class="btn btn-sm btn-ghost rem-quick" data-open-customer="${c.id}">${t('rem.profile')}</button>` : ''}
        ${r.uiStatus==='completed'
          ? `<span class="pill pill-green">${t('status.completed')}</span>`
          : `<button class="btn btn-sm btn-ghost" data-rem-followup="${r.id}">${t('btn.followUpAgain')}</button><button class="btn btn-sm btn-primary" data-rem-done="${r.id}">${t('btn.complete')}</button>`
        }
      </div>
    </div>`;
  }).join('') : emptyState();
  bindRowOpens();
  document.querySelectorAll('[data-rem-done]').forEach(b=> b.addEventListener('click', ()=>{ DB.reminderState[b.dataset.remDone]='completed'; saveDB(DB); toast(t('toast.reminderDone')); renderReminders(); renderNav(); }));
  document.querySelectorAll('[data-rem-followup]').forEach(b=> b.addEventListener('click', ()=>{ DB.reminderState[b.dataset.remFollowup]='pending'; saveDB(DB); toast(t('toast.reminderFollowup')); renderReminders(); }));
  document.querySelectorAll('[data-rem-copy]').forEach(b=> b.addEventListener('click', ()=>{
    const v = b.dataset.remCopy;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(()=>toast(t('rem.copied')+': '+v)).catch(()=>{ prompt(t('rem.copyNumber'), v); });
  }));
  document.querySelectorAll('[data-rem-recharge]').forEach(b=> b.addEventListener('click', ()=> openPrepaidAssignModal(b.dataset.remRecharge, 'recharge')));
}
/* The "Prepaid expiring" tab's own render path — deliberately separate from the generic
   reminder list above, since this works over every current prepaid subscription (not a
   30-day actionable window) and needs its own richer filter set: signup month, plan
   duration, nationality, and a current-status breakdown (expired / expiring soon / still
   active), rather than the single due-date sort the other tabs use. */
function renderExpiringCohortTab(cohortAll){
  const durationsPresent = [...new Set(cohortAll.map(x=>x.service.durationDays).filter(Boolean))].sort((a,b)=>a-b);
  const durSel = document.getElementById('reminderDurationFilter');
  durSel.innerHTML = `<option value="all">${t('rep.allTime')}</option>` + durationsPresent.map(d=>`<option value="${d}">${d} ${LANG==='zh'?'天':'days'}</option>`).join('');
  durSel.value = reminderDurationFilter;
  durSel.onchange = ()=>{ reminderDurationFilter = durSel.value; renderReminders(); };

  const natsPresent = [...new Set(cohortAll.map(x=>x.customer.nationality).filter(Boolean))].sort();
  const natSel = document.getElementById('reminderNationalityFilter');
  natSel.innerHTML = `<option value="all">${t('filter.allNationalities')}</option>` + natsPresent.map(n=>`<option value="${n}">${n}</option>`).join('');
  natSel.value = reminderNationalityFilter;
  natSel.onchange = ()=>{ reminderNationalityFilter = natSel.value; renderReminders(); };

  const monthsWithPrepaidSignups = [...new Set(DB.services.filter(s=>s.type==='prepaid' && s.activationDate).map(s=>s.activationDate.slice(0,7)))].sort().reverse();
  const monthSel = document.getElementById('reminderSignupMonth');
  monthSel.innerHTML = `<option value="all">${t('rep.allTime')}</option>` + monthsWithPrepaidSignups.map(m=>`<option value="${m}">${fmtMonthLabel(m)}</option>`).join('');
  monthSel.value = reminderSignupMonth;
  monthSel.onchange = ()=>{ reminderSignupMonth = monthSel.value; renderReminders(); };

  // apply signup month / duration / nationality first, THEN compute status counts off of
  // that already-narrowed set — so the status chip counts reflect the other filters too,
  // rather than always showing totals across everyone regardless of what's been picked
  let scoped = cohortAll;
  if(reminderSignupMonth!=='all') scoped = scoped.filter(x=> x.service.activationDate && x.service.activationDate.slice(0,7)===reminderSignupMonth);
  if(reminderDurationFilter!=='all') scoped = scoped.filter(x=> String(x.service.durationDays)===reminderDurationFilter);
  if(reminderNationalityFilter!=='all') scoped = scoped.filter(x=> x.customer.nationality===reminderNationalityFilter);

  const statusChips = [
    {key:'all', label:t('rem.status.all'), n:scoped.length},
    {key:'expired', label:t('rem.status.expired'), n:scoped.filter(x=>x.status==='expired').length},
    {key:'expiring_soon', label:t('rem.status.expiringSoon'), n:scoped.filter(x=>x.status==='expiring_soon').length},
    {key:'active', label:t('rem.status.active'), n:scoped.filter(x=>x.status==='active').length},
  ];
  document.getElementById('reminderStatusChips').innerHTML = statusChips.map(sc=>`<button class="chip-tab ${reminderStatusFilter===sc.key?'active':''}" data-statuschip="${sc.key}">${sc.label} <span class="n">${sc.n}</span></button>`).join('');
  document.querySelectorAll('[data-statuschip]').forEach(b=> b.addEventListener('click', ()=>{ reminderStatusFilter=b.dataset.statuschip; renderReminders(); }));

  const final = reminderStatusFilter==='all' ? scoped : scoped.filter(x=>x.status===reminderStatusFilter);
  // expired first (most urgent to act on), then soonest-expiring, then everyone else
  final.sort((a,b)=>{
    const order = {expired:0, expiring_soon:1, active:2};
    if(order[a.status]!==order[b.status]) return order[a.status]-order[b.status];
    return (a.daysLeft??999) - (b.daysLeft??999);
  });

  const statusPill = st => st==='expired' ? `<span class="pill pill-red">${t('rem.status.expired')}</span>`
    : st==='expiring_soon' ? `<span class="pill pill-orange">${t('rem.status.expiringSoon')}</span>`
    : `<span class="pill pill-green">${t('rem.status.active')}</span>`;

  document.getElementById('reminderList').innerHTML = final.length ? final.map(x=>{
    const {customer:c, service:svc, daysLeft} = x;
    const dtxt = daysLeft===null ? '' : (daysLeft<0 ? `${Math.abs(daysLeft)} ${t('rem.overdue')}` : (daysLeft===0? t('rem.today') : `${daysLeft} ${t('rem.dueIn')}`));
    const accent = x.status==='expired' ? '#DC2626' : (x.status==='expiring_soon' ? '#EA580C' : '#16A34A');
    return `<div class="rem-row" style="--accent:${accent};">
      <span class="avatar">${initials(c.name)}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;cursor:pointer;" data-open-customer="${c.id}">${escapeHtml(c.name)} <span class="pill pill-blue" style="margin-left:4px;">${escapeHtml(c.nationality||'')}</span></div>
        <div class="muted" style="font-size:12px;">${escapeHtml(svc.plan||'')} · ${svc.durationDays||'?'} ${LANG==='zh'?'天':'days'} · ${LANG==='zh'?'开通于':'signed up'} ${fmtDate(svc.activationDate)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto;">
        ${dtxt ? `<span class="muted" style="font-size:12px;">${dtxt}</span>` : ''}
        ${statusPill(x.status)}
      </div>
    </div>`;
  }).join('') : emptyState();
  bindRowOpens();
}
/* Deliberately simpler than renderExpiringCohortTab above — no signup-month/duration/
   nationality filters, since the point here isn't segmenting a big list, it's giving a
   clear, honest answer to "is this customer locked in or free to change" without making
   "free to change" look like a problem that needs fixing. */
function renderPostpaidContractTab(list){
  const sorted = [...list].sort((a,b)=>{
    const order = {over_contract:0, expiring_soon:1, active:2};
    if(order[a.status]!==order[b.status]) return order[a.status]-order[b.status];
    return (a.daysLeft??999) - (b.daysLeft??999);
  });
  const statusPill = st => st==='over_contract' ? `<span class="pill pill-blue">${t('rem.status.overContract')}</span>`
    : st==='expiring_soon' ? `<span class="pill pill-orange">${t('rem.status.contractEndingSoon')}</span>`
    : `<span class="pill pill-green">${t('rem.status.inContract')}</span>`;
  const statusNote = st => st==='over_contract' ? t('rem.status.overContractNote')
    : st==='expiring_soon' ? t('rem.status.contractEndingSoonNote')
    : '';
  document.getElementById('reminderList').innerHTML = `
    <div class="section-desc" style="margin-bottom:12px;">${t('rem.postpaidContract.desc')}</div>
    ${sorted.length ? sorted.map(x=>{
      const {customer:c, service:svc, daysLeft} = x;
      const dtxt = daysLeft===null ? '' : (daysLeft<0 ? `${Math.abs(daysLeft)}${LANG==='zh'?' 天前已超期':'d past contract end'}` : (daysLeft===0? t('rem.today') : `${daysLeft} ${t('rem.dueIn')}`));
      const accent = x.status==='over_contract' ? '#2563EB' : (x.status==='expiring_soon' ? '#EA580C' : '#16A34A');
      return `<div class="rem-row" style="--accent:${accent};align-items:flex-start;">
        <span class="avatar">${initials(c.name)}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;cursor:pointer;" data-open-customer="${c.id}">${escapeHtml(c.name)} <span class="pill pill-blue" style="margin-left:4px;">${escapeHtml(c.nationality||'')}</span></div>
          <div class="muted" style="font-size:12px;">${escapeHtml(svc.plan||'')} · ${escapeHtml(c.phone||'—')} · ${LANG==='zh'?'合约期至':'contract through'} ${fmtDate(svc.expiryDate)}</div>
          ${statusNote(x.status) ? `<div class="muted" style="font-size:11.5px;margin-top:2px;">${statusNote(x.status)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto;">
          ${dtxt ? `<span class="muted" style="font-size:12px;">${dtxt}</span>` : ''}
          ${statusPill(x.status)}
        </div>
      </div>`;
    }).join('') : emptyState()}`;
  bindRowOpens();
}
/* Same list-row pattern as the other Reminders tabs, but for pending Passport -> Resident
   Card (ARC) change requests — shows who's handling each one and how long it's been
   waiting, with a direct "Mark complete" action right in the list so staff don't need to
   open each customer's profile individually to close these out. */
function renderIdChangeTab(list){
  document.getElementById('reminderList').innerHTML = `
    <div class="section-desc" style="margin-bottom:12px;">${t('rem.idChange.modalDesc')}</div>
    ${list.length ? list.map(({customer:c, request, daysPending})=>{
      const accent = daysPending>=7 ? '#DC2626' : (daysPending>=3 ? '#EA580C' : '#2563EB');
      return `<div class="rem-row" style="--accent:${accent};align-items:flex-start;">
        <span class="avatar">${initials(c.name)}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;cursor:pointer;" data-open-customer="${c.id}">${escapeHtml(c.name)} <span class="pill pill-blue" style="margin-left:4px;">${escapeHtml(c.nationality||'')}</span></div>
          <div class="muted" style="font-size:12px;">${t('rem.idChange.requestedOn')} ${fmtDate(request.requestedDate)} · ${t('rem.idChange.handledBy')} ${escapeHtml(request.handledBy||'—')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto;">
          <span class="pill ${daysPending>=7?'pill-red':(daysPending>=3?'pill-orange':'pill-blue')}">${daysPending} ${LANG==='zh'?'天':'days'}</span>
          <button class="btn btn-sm btn-ghost" data-idchange-print="${c.id}">🖨 ${t('btn.print')}</button>
          <button class="btn btn-sm btn-primary" data-idchange-complete="${c.id}">✓ ${t('btn.markComplete')}</button>
        </div>
      </div>`;
    }).join('') : emptyState()}`;
  bindRowOpens();
  document.querySelectorAll('[data-idchange-print]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      printIdChangeForm(btn.getAttribute('data-idchange-print'));
    });
  });
  document.querySelectorAll('[data-idchange-complete]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const custId = btn.getAttribute('data-idchange-complete');
      completeIdChangeRequest(custId, ()=>{
        renderReminders();
        renderNav();
        // Take the user straight to this customer's profile so they can see the
        // completed request land in Plan History right away — rather than just
        // refreshing the Reminders list behind the scenes, which made it look like
        // nothing happened.
        openCustomerDetail(custId);
      });
    });
  });
}


/* ---------------- ORDERS PAGE ---------------- */
/* renderOrders() removed 2026-11-11 with the Orders page (see renderPage). */

/* ---------------- REPORTS ---------------- */
let repSelectedMonth = null; // null = all time
let reportView = 'monthly';
let repSelectedDay = null;
/* Always the catalog/estimated figure, regardless of whether a real settlement exists yet —
   netProfitFor() deliberately prefers the real figure once reconciled, which is right for
   "current best-known income" but wrong for a card that specifically means "expected". */
function expectedIncomeFor(s){
  if(!s || s.type!=='postpaid') return 0;
  return Math.max(0, (Number(s.expectedProfit)||0) - discountTotalFor(s) - (Number(s.usimFee)||0));
}
function renderReports(){
  const tabs = [{key:'monthly', label:'rep.view.monthly'}, {key:'daily', label:'rep.view.daily'}];
  document.getElementById('reportViewTabs').innerHTML = tabs.map(tb=>`<button class="chip-tab ${reportView===tb.key?'active':''}" data-reportview="${tb.key}">${t(tb.label)}</button>`).join('');
  document.querySelectorAll('[data-reportview]').forEach(b=> b.addEventListener('click', ()=>{ reportView=b.dataset.reportview; renderReports(); }));
  document.getElementById('repMonthlyView').style.display = reportView==='monthly' ? '' : 'none';
  document.getElementById('repDailyView').style.display = reportView==='daily' ? '' : 'none';
  if(reportView==='monthly') renderMonthlyReport(); else renderDailyReport();
}
function renderMonthlyReport(){
  const allSvcs = DB.services.filter(s=>isSubscriptionType(s.type));
  const now = new Date();
  const curMonthStr = localMonthKey(0);

  const monthsWithData = [...new Set(allSvcs.map(s=>(s.activationDate||'').slice(0,7)).filter(Boolean))].sort().reverse();
  if(repSelectedMonth===null){
    repSelectedMonth = monthsWithData.includes(curMonthStr) ? curMonthStr : (monthsWithData[0] || 'all');
  }
  const monthSel = document.getElementById('repMonthSelect');
  monthSel.innerHTML = `<option value="all">${t('rep.allTime')}</option>` + monthsWithData.map(m=>`<option value="${m}">${fmtMonthLabel(m)}</option>`).join('');
  monthSel.value = repSelectedMonth;

  const isAllTime = repSelectedMonth==='all';
  const svcs = isAllTime ? allSvcs : allSvcs.filter(s=>(s.activationDate||'').slice(0,7)===repSelectedMonth);
  const prepaidSvcs = svcs.filter(s=>s.type==='prepaid');
  const postpaidSvcs = svcs.filter(s=>s.type==='postpaid');

  const prepaidIncome = prepaidSvcs.reduce((a,s)=>a+(Number(s.sellingPrice)||0),0);
  const postpaidExpected = postpaidSvcs.reduce((a,s)=>a+expectedIncomeFor(s),0);
  const reconciled = postpaidSvcs.filter(s=>s.actualProfit);
  const postpaidActual = reconciled.reduce((a,s)=>a+netProfitFor(s),0);
  const accumulated = prepaidIncome + postpaidSvcs.reduce((a,s)=>a+netProfitFor(s),0);
  document.getElementById('repIncomeCards').innerHTML = [
    {label:t('rep.prepaidIncome'), value:fmtWon(prepaidIncome), sub:`${prepaidSvcs.length} ${t('rep.transactionCount')}`},
    {label:t('rep.postpaidExpected'), value:fmtWon(postpaidExpected), sub:`${postpaidSvcs.length} ${t('rep.transactionCount')}`},
    {label:t('rep.postpaidActual'), value:reconciled.length?fmtWon(postpaidActual):t('stat.notReconciled'), sub:`${reconciled.length}/${postpaidSvcs.length} ${t('stat.reconciledCount')}`},
    {label:t('rep.accumulated'), value:fmtWon(accumulated), sub:isAllTime?t('rep.allTime'):fmtMonthLabel(repSelectedMonth), highlight:true},
  ].map(s=>`<div class="card stat-card" ${s.highlight?'style="background:linear-gradient(135deg,#0F1B3D,#1E3A6E);"':''}>
      <div class="stat-label" ${s.highlight?'style="color:#B9C2E0;"':''}>${s.label}</div>
      <div class="stat-value${/\d/.test(String(s.value))?'':' stat-value-text'}" ${s.highlight?'style="color:#fff;"':''}>${s.value}</div>
      <div class="stat-delta" ${s.highlight?'style="color:#B9C2E0;"':''}>${s.sub}</div>
    </div>`).join('');

  const newCustomerIds = new Set(svcs.map(s=>s.customerId));
  // partition by each customer's CURRENT type (not service count) so this sub-label always
  // sums exactly to the total above it — same fix as Dashboard's "New this month" breakdown:
  // a customer with both a prepaid and postpaid transaction in the same month would
  // otherwise get counted in both halves, making "2 Prepaid · 1 Postpaid" add up to 3 when
  // the actual total was 2 unique customers
  const newThisMonthPrepaidCount = DB.customers.filter(c=> newCustomerIds.has(c.id) && (c.subType||'prepaid')==='prepaid').length;
  const newThisMonthPostpaidCount = DB.customers.filter(c=> newCustomerIds.has(c.id) && c.subType==='postpaid').length;
  const pendingReminders = buildReminders().filter(r=>r.uiStatus==='pending').length;
  document.getElementById('repSecondaryStats').innerHTML = [
    {label:t('stat.newThisMonth'), value:newCustomerIds.size, sub:`${newThisMonthPrepaidCount} ${t('rep.nowPrepaid')} · ${newThisMonthPostpaidCount} ${t('rep.nowPostpaid')}`},
    {label:t('stat.pendingReminders'), value:pendingReminders},
  ].map(s=>`<div class="card stat-card"><div class="stat-label">${s.label}</div><div class="stat-value">${s.value}</div>${s.sub?`<div class="stat-delta">${s.sub}</div>`:''}</div>`).join('');
  document.getElementById('repMonthlyPaymentBreakdown').innerHTML = paymentBreakdownHtml(prepaidSvcs,
    LANG==='zh'?'该月份没有先付记录':'No prepaid signups in this period');

  const typeMap = {};
  svcs.forEach(s=>{ const k=t('type.'+s.type); typeMap[k]=typeMap[k]||{rev:0}; typeMap[k].rev+=netProfitFor(s); });
  renderMoneyBars('repByType', typeMap);

  const planMap = {};
  svcs.forEach(s=>{ const k=(s.carrier||'')+' · '+(s.plan||''); planMap[k]=(planMap[k]||0)+1; });
  const topPlans = Object.entries(planMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  renderBarChart('repPlans', topPlans);

  const byMonth = {};
  allSvcs.forEach(s=>{
    const m=(s.activationDate||'').slice(0,7); if(!m) return;
    byMonth[m]=byMonth[m]||{prepaidN:0,prepaidIncome:0,postpaidN:0,postpaidExpected:0,postpaidActual:0,postpaidReconciled:0};
    if(s.type==='prepaid'){ byMonth[m].prepaidN++; byMonth[m].prepaidIncome+=Number(s.sellingPrice)||0; }
    else if(s.type==='postpaid'){
      byMonth[m].postpaidN++;
      byMonth[m].postpaidExpected+=expectedIncomeFor(s);
      if(s.actualProfit){ byMonth[m].postpaidActual+=netProfitFor(s); byMonth[m].postpaidReconciled++; }
    }
  });
  const months = Object.keys(byMonth).sort().reverse();
  const chartMax = Math.max(1, ...months.map(m=>byMonth[m].prepaidIncome + (byMonth[m].postpaidReconciled===byMonth[m].postpaidN ? byMonth[m].postpaidActual : byMonth[m].postpaidExpected)));
  // stacked columns, oldest → newest, last 12 months with activity; proper "Oct 26" labels
  // (the old row chart stripped the month and showed only the year on every row)
  const last12 = []; for(let i=11;i>=0;i--) last12.push(localMonthKey(-i)); // consecutive months, so gaps show as gaps
  const emptyMonth = {prepaidN:0,prepaidIncome:0,postpaidN:0,postpaidExpected:0,postpaidActual:0,postpaidReconciled:0};
  renderColumnChart('repMonthlyChart', last12.map(m=>{
    const d = byMonth[m] || emptyMonth;
    const postpaidVal = d.postpaidReconciled===d.postpaidN && d.postpaidN ? d.postpaidActual : d.postpaidExpected;
    return {label: shortMonthLabel(m), total: d.prepaidIncome + postpaidVal, current: m===repSelectedMonth,
      segments:[{v:d.prepaidIncome, color:'var(--orange)', name:t('opt.prepaidShort')}, {v:postpaidVal, color:'var(--blue)', name:t('opt.postpaidShort')}]};
  }), {legend:[{name:t('opt.prepaidShort'), color:'var(--orange)'}, {name:t('opt.postpaidShort'), color:'var(--blue)'}]});

  // running cumulative total — computed chronologically (oldest first) regardless of the
  // table's newest-first display order, so each month's figure genuinely represents
  // "everything earned up to and including this month"
  const monthsChrono = [...months].reverse();
  let cumulative = 0;
  const cumulativeByMonth = {};
  monthsChrono.forEach(m=>{
    const d = byMonth[m];
    const postpaidVal = d.postpaidReconciled===d.postpaidN && d.postpaidN ? d.postpaidActual : d.postpaidExpected;
    cumulative += d.prepaidIncome + postpaidVal;
    cumulativeByMonth[m] = cumulative;
  });

  document.getElementById('repMonthlyBody').innerHTML = months.length ? months.map(m=>{
    const d = byMonth[m];
    const postpaidVal = d.postpaidReconciled===d.postpaidN && d.postpaidN ? d.postpaidActual : d.postpaidExpected;
    return `<tr class="row-click" data-month-row="${m}">
      <td>${fmtMonthLabel(m)}</td>
      <td>${d.prepaidN}</td>
      <td>${fmtWon(d.prepaidIncome)}</td>
      <td>${d.postpaidN}</td>
      <td>${fmtWon(d.postpaidExpected)}</td>
      <td>${d.postpaidReconciled ? `${fmtWon(d.postpaidActual)} <span class="muted" style="font-size:11px;">(${d.postpaidReconciled}/${d.postpaidN})</span>` : `<span class="muted">${t('stat.notReconciled')}</span>`}</td>
      <td style="font-weight:700;">${fmtWon(d.prepaidIncome + postpaidVal)}</td>
      <td style="font-weight:700;color:var(--blue);">${fmtWon(cumulativeByMonth[m])}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="8">${emptyState()}</td></tr>`;
  document.querySelectorAll('[data-month-row]').forEach(el=>{
    el.addEventListener('click', ()=>{ repSelectedMonth = el.getAttribute('data-month-row'); renderReports(); window.scrollTo({top:0,behavior:'smooth'}); });
  });
}
function renderDailyReport(){
  const allSvcs = DB.services.filter(s=>isSubscriptionType(s.type) && isIsoDate(s.activationDate));
  const daySel = document.getElementById('repDaySelect');
  if(!repSelectedDay) repSelectedDay = todayISO();
  daySel.value = repSelectedDay;

  const byDay = {};
  allSvcs.forEach(s=>{
    const d = s.activationDate;
    byDay[d]=byDay[d]||{prepaidN:0,prepaidIncome:0,postpaidN:0,postpaidExpected:0};
    if(s.type==='prepaid'){ byDay[d].prepaidN++; byDay[d].prepaidIncome+=Number(s.sellingPrice)||0; }
    else if(s.type==='postpaid'){ byDay[d].postpaidN++; byDay[d].postpaidExpected+=expectedIncomeFor(s); }
  });

  const sel = byDay[repSelectedDay] || {prepaidN:0,prepaidIncome:0,postpaidN:0,postpaidExpected:0};
  document.getElementById('repDailyCards').innerHTML = [
    {label:t('rep.daily.prepaidCustomers'), value:sel.prepaidN},
    {label:t('rep.prepaidIncome'), value:fmtWon(sel.prepaidIncome)},
    {label:t('rep.daily.postpaidCustomers'), value:sel.postpaidN},
    {label:t('rep.postpaidExpected'), value:fmtWon(sel.postpaidExpected)},
  ].map(s=>`<div class="card stat-card"><div class="stat-label">${s.label}</div><div class="stat-value">${s.value}</div></div>`).join('');

  // per-customer breakdown for the selected day — exactly who signed up and for how much,
  // not just an aggregate count, split by type so it's immediately clear which is which
  const dayPrepaid = allSvcs.filter(s=>s.type==='prepaid' && s.activationDate===repSelectedDay)
    .sort((a,b)=> (Number(b.sellingPrice)||0)-(Number(a.sellingPrice)||0));
  const dayPostpaid = allSvcs.filter(s=>s.type==='postpaid' && s.activationDate===repSelectedDay)
    .sort((a,b)=> expectedIncomeFor(b)-expectedIncomeFor(a));

  const custListHtml = (list, priceFn) => list.length ? list.map(s=>{
    const c = getCustomer(s.customerId);
    return `<div class="row-click" data-open-customer="${s.customerId}" style="display:flex;justify-content:space-between;align-items:center;padding:9px 4px;border-bottom:1px solid var(--border);cursor:pointer;">
      <div style="display:flex;align-items:center;gap:9px;"><span class="avatar" style="width:26px;height:26px;font-size:11px;">${initials(c?c.name:'?')}</span><span>${c?escapeHtml(c.name):'—'}</span></div>
      <b>${fmtWon(priceFn(s))}</b>
    </div>`;
  }).join('') : `<div class="muted" style="padding:10px 4px;">${LANG==='zh'?'当天没有记录':'No signups this day'}</div>`;

  document.getElementById('repDailyPrepaidList').innerHTML = custListHtml(dayPrepaid, s=>Number(s.sellingPrice)||0);
  document.getElementById('repDailyPostpaidList').innerHTML = custListHtml(dayPostpaid, s=>expectedIncomeFor(s));
  document.querySelectorAll('#repDailyPrepaidList [data-open-customer], #repDailyPostpaidList [data-open-customer]').forEach(el=>{
    el.addEventListener('click', ()=> openCustomerDetail(el.getAttribute('data-open-customer')));
  });

  // Payment method breakdown for the day — prepaid only, since postpaid doesn't carry a
  // payment method at all (it's a monthly contract billed by the carrier, not a one-time
  // payment collected in-store the way prepaid is).
  document.getElementById('repDailyPaymentBreakdown').innerHTML = paymentBreakdownHtml(dayPrepaid);

  const days = Object.keys(byDay).sort().reverse().slice(0,30);
  document.getElementById('repDailyBody').innerHTML = days.length ? days.map(d=>{
    const v = byDay[d];
    return `<tr class="row-click" data-day-row="${d}">
      <td class="nowrap">${fmtDate(d)}</td><td>${v.prepaidN}</td><td>${fmtWon(v.prepaidIncome)}</td>
      <td>${v.postpaidN}</td><td>${fmtWon(v.postpaidExpected)}</td>
      <td style="font-weight:700;">${fmtWon(v.prepaidIncome+v.postpaidExpected)}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6">${emptyState()}</td></tr>`;
  document.querySelectorAll('[data-day-row]').forEach(el=>{
    el.addEventListener('click', ()=>{ repSelectedDay = el.getAttribute('data-day-row'); renderReports(); window.scrollTo({top:0,behavior:'smooth'}); });
  });
}
function fmtMonthLabel(m){
  if(!m || m==='all') return t('rep.allTime');
  const [y,mo] = m.split('-');
  return LANG==='zh' ? `${y}年${Number(mo)}月` : new Date(Number(y),Number(mo)-1,1).toLocaleDateString('en-US',{year:'numeric',month:'long'});
}
document.getElementById('repMonthSelect').addEventListener('change', e=>{ repSelectedMonth = e.target.value; renderReports(); });
document.getElementById('repDaySelect').addEventListener('change', e=>{ repSelectedDay = e.target.value; renderReports(); });
function renderMoneyBars(elId, map){
  const entries = Object.entries(map).sort((a,b)=>b[1].rev-a[1].rev);
  const max = Math.max(1, ...entries.map(([,v])=>Math.abs(v.rev)));
  document.getElementById(elId).innerHTML = entries.length ? entries.map(([k,v])=>`
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(k)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(Math.abs(v.rev)/max*100)}%;${v.rev<0?'background:var(--red);':''}"></div></div>
      <div class="bar-val">${fmtWon(v.rev)}</div>
    </div>`).join('') : `<div class="muted">—</div>`;
}

/* ---------------- IMPORT / EXPORT ---------------- */
function renderIO(){
  document.getElementById('syncServerUrl').value = getServerUrl();
  document.getElementById('syncApiKey').value = getApiKey();
  document.getElementById('syncEnabledCheckbox').checked = isSyncEnabled();
  updateSyncStatusUI();
  // data issues
  const issues = [];
  DB.customers.forEach(c=>{
    const problems = [];
    if(!c.phone) problems.push(t('issue.noContact'));
    if(!c.idExpiry) problems.push(t('issue.noIdExpiry'));
    if(!c.idNumber) problems.push(t('issue.noIdNumber'));
    const svcs = customerServices(c.id);
    if(!svcs.length) problems.push(t('issue.noActiveService'));
    const unpaid = svcs.some(s=>(s.sellingPrice||0) > (s.received||0));
    if(unpaid) problems.push(t('issue.unpaid'));
    if(problems.length) issues.push({c,problems});
  });
  document.getElementById('dataIssuesList').innerHTML = issues.length ? `<div class="tbl-wrap"><table><thead><tr><th data-i18n="col.customer">${t('col.customer')}</th><th>${LANG==='zh'?'问题':'Issues'}</th><th></th></tr></thead><tbody>${
    issues.map(({c,problems})=>`<tr><td class="name-cell" title="${escapeHtml(c.name)}"><span class="avatar">${initials(c.name)}</span><span class="name-text">${escapeHtml(c.name)}</span></td><td>${problems.map(p=>`<span class="pill pill-red" style="margin-right:4px;">${p}</span>`).join('')}</td><td><button class="btn btn-sm btn-ghost" data-open-customer="${c.id}">${t('btn.view')}</button></td></tr>`).join('')
  }</tbody></table></div>` : `<div class="empty-state">${t('io.issues.none')}</div>`;
  bindRowOpens();
  renderPlanCheck();
}

/* ============================================================
   PLAN & DATE CHECK — read-only report of customers whose plan length, dates and price
   disagree (e.g. a "3个月" / ₩55,000 plan stored as 30 days, ending one month after it
   started). It never changes anything by itself: each row has explicit fix buttons that
   ask for confirmation first, so no customer data is altered without a person deciding.
   ============================================================ */
const PREPAID_STD_DAYS = PREPAID_PLANS.map(p=>p.days);            // 15, 30, 60, 90
const PREPAID_PRICE_DAYS = {20000:15, 30000:30, 40000:60, 55000:90, 36000:30, 36300:30};
function frozenDaysOf(svc){ return (svc.freezes||[]).reduce((a,f)=> a + (isIsoDate(f.startDate)&&isIsoDate(f.endDate) ? daysBetween(f.startDate,f.endDate)+1 : 0), 0); }
function nearestOf(list, v){ return list.reduce((b,x)=> Math.abs(x-v)<Math.abs(b-v)?x:b, list[0]); }
function runPlanCheck(includeHistory){
  const out = [];
  const today = todayISO();
  const add = (c, svc, severity, code, msg, fix) => out.push({c, svc, severity, code, msg, fix: fix||[]});
  DB.customers.forEach(c=>{
    const all = customerServices(c.id).filter(s=>isSubscriptionType(s.type));
    const actives = all.filter(s=>s.isActive);
    if(actives.length > 1) add(c, actives[0], 'high', 'multi', `${actives.length} plans are marked active at the same time`);
    const active = actives[0] || null;
    if(active && c.subType && active.type!==c.subType) add(c, active, 'medium', 'subtype', `Customer is tagged ${c.subType} but the current plan is ${active.type}`);
    const list = includeHistory ? all : actives;
    list.forEach(svc=>{
      const isPre = svc.type==='prepaid';
      const fz = frozenDaysOf(svc);
      const dur = Number(svc.durationDays)||0;
      const base = dur - fz;
      const a = isIsoDate(svc.activationDate) ? svc.activationDate.slice(0,10) : '';
      const e = isIsoDate(svc.expiryDate) ? svc.expiryDate.slice(0,10) : '';
      const past = svc.isActive===false ? ' (past plan)' : '';
      if(!a || !e){ add(c, svc, 'high', 'missing', `Missing ${!a?'start':''}${!a&&!e?' and ':''}${!e?'end':''} date${past}`); return; }
      if(e < a){ add(c, svc, 'high', 'order', `End date ${e} is before start date ${a}${past}`); return; }
      if(a > addDaysISO(today, 7)) add(c, svc, 'medium', 'future', `Start date ${a} is in the future${past}`);
      const span = daysBetween(a, e);
      // 1) the stored length disagrees with what the plan name / price say
      if(isPre){
        const planDays = planTextDays(svc.plan);
        const priceVal = Number(svc.price)||Number(svc.sellingPrice)||0;
        const priceDays = PREPAID_PRICE_DAYS[priceVal] || 0;
        const evidence = [];
        if(planDays && Math.abs(planDays - base) > 5) evidence.push(`plan name "${svc.plan}" = ${planDays} days`);
        if(priceDays && Math.abs(priceDays - base) > 5 && !(priceDays===30 && base<=35 && base>=28)) evidence.push(`price ${fmtWon(priceVal)} = ${priceDays}-day price`);
        if(evidence.length){
          const target = nearestOf(PREPAID_STD_DAYS, planDays || priceDays);
          add(c, svc, 'high', 'length', `Stored as ${base} days (${a} → ${e}) but ${evidence.join(' and ')}${past}`,
            [{kind:'length', days: target, label:`Make it ${target} days (ends ${addDaysISO(a, target+fz)})`}]);
          return;
        }
      }
      // 2) start → end doesn't equal the stored length
      if(dur && span !== dur){
        add(c, svc, 'medium', 'span', `Start → end is ${span} days, but plan length is ${dur} days${fz?` (incl. ${fz} frozen)`:''}${past}`,
          [{kind:'end', label:`Set end to ${addDaysISO(a, dur)} (keep ${dur} days)`},
           {kind:'dur', days: span, label:`Set length to ${span} days (keep end ${e})`}]);
      }
      // 3) lengths that don't exist in the catalogue
      if(isPre && base && !PREPAID_STD_DAYS.includes(base) && !(base>=28 && base<=31)){
        add(c, svc, 'low', 'odd', `Unusual prepaid length: ${base} days (normal: 15 / 30 / 60 / 90)${past}`);
      }
      if(!isPre && base && ![185,245,365].includes(base)){
        add(c, svc, 'low', 'odd', `Unusual postpaid contract: ${base} days (normal: 245 / 365)${past}`);
      }
      if(isPre && svc.simType==='esim' && base!==90 && svc.isActive){
        add(c, svc, 'medium', 'esim', `eSIM on a ${base}-day plan — eSIM is only sold on the 90-day plan`);
      }
    });
    if(active && active.type==='postpaid'){
      const age = calcAge(c.dob);
      if(age!==null && age < 19) add(c, active, 'low', 'age', `Postpaid customer is ${age} (postpaid needs 19+)`);
    }
  });
  const rank = {high:0, medium:1, low:2};
  out.sort((x,y)=> rank[x.severity]-rank[y.severity] || String(x.c.name).localeCompare(String(y.c.name)));
  return out;
}
let lastPlanCheck = [];
function renderPlanCheck(){
  const listEl = document.getElementById('planCheckList');
  if(!listEl) return;
  const zh = LANG==='zh';
  document.getElementById('planCheckTitle').textContent = zh ? '套餐与日期核对' : 'Plan & date check';
  document.getElementById('planCheckDesc').textContent = zh ? '套餐天数、开通/到期日期与价格互相不一致的客户。只有点击修正按钮才会更改数据。' : "Customers whose plan length, start/end dates and price don't agree. Nothing is changed unless you press a fix button.";
  document.getElementById('planCheckHistLabel').textContent = zh ? '包含历史套餐' : 'Include past plans';
  document.getElementById('btnPlanCheckExport').textContent = zh ? '下载列表（Excel）' : 'Download list (Excel)';
  const inclHist = document.getElementById('planCheckIncludeHistory').checked;
  const res = runPlanCheck(inclHist);
  lastPlanCheck = res;
  const n = k => res.filter(r=>r.severity===k).length;
  const custCount = new Set(res.map(r=>r.c.id)).size;
  document.getElementById('planCheckSummary').innerHTML = res.length
    ? `<b>${custCount}</b> ${zh?'位客户，':'customer(s), '}<span class="pill pill-red">${n('high')} ${zh?'严重':'high'}</span> <span class="pill pill-orange">${n('medium')} ${zh?'中':'medium'}</span> <span class="pill pill-blue">${n('low')} ${zh?'低':'low'}</span>`
    : `<span class="pill pill-green">${zh?'全部一致 ✓':'Everything matches ✓'}</span>`;
  const sevPill = s => s==='high' ? 'pill-red' : s==='medium' ? 'pill-orange' : 'pill-blue';
  listEl.innerHTML = res.length ? `<div class="tbl-wrap"><table><thead><tr><th>${t('col.customer')}</th><th>${zh?'类型':'Type'}</th><th>${zh?'问题':'Problem'}</th><th>${zh?'操作':'Action'}</th></tr></thead><tbody>${
    res.map((r,i)=>`<tr>
      <td class="name-cell" title="${escapeHtml(r.c.name)}"><span class="avatar">${initials(r.c.name)}</span><span class="name-text">${escapeHtml(r.c.name)}</span></td>
      <td><span class="pill ${sevPill(r.severity)}">${escapeHtml(r.svc?.type||'')}</span></td>
      <td style="white-space:normal;min-width:260px;">${escapeHtml(r.msg)}</td>
      <td style="white-space:normal;"><div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-ghost" data-open-customer="${r.c.id}">${t('btn.view')}</button>
        ${r.fix.map((f,j)=>`<button class="btn btn-sm btn-primary" data-plancheck-fix="${i}:${j}">${escapeHtml(f.label)}</button>`).join('')}
      </div></td></tr>`).join('')
  }</tbody></table></div>` : '';
  bindRowOpens();
  listEl.querySelectorAll('[data-plancheck-fix]').forEach(b=> b.addEventListener('click', ()=>{
    const [i,j] = b.dataset.plancheckFix.split(':').map(Number);
    applyPlanCheckFix(lastPlanCheck[i], lastPlanCheck[i]?.fix[j]);
  }));
}
function applyPlanCheckFix(r, f){
  if(!r || !f) return;
  const svc = getService(r.svc.id);
  if(!svc) return;
  const fz = frozenDaysOf(svc);
  const before = `${svc.durationDays} days, ${svc.activationDate} → ${svc.expiryDate}`;
  let durationDays = Number(svc.durationDays)||0, expiryDate = svc.expiryDate;
  if(f.kind==='length'){ durationDays = f.days + fz; expiryDate = addDaysISO(svc.activationDate, durationDays); }
  else if(f.kind==='end'){ expiryDate = addDaysISO(svc.activationDate, durationDays); }
  else if(f.kind==='dur'){ durationDays = f.days; }
  const after = `${durationDays} days, ${svc.activationDate} → ${expiryDate}`;
  const zh = LANG==='zh';
  if(!confirm(zh ? `修改「${r.c.name}」的套餐：

原来：${before}
修改后：${after}

是否继续？` : `Change ${r.c.name}'s plan?

Now:   ${before}
After: ${after}

Continue?`)) return;
  svc.durationDays = durationDays;
  svc.expiryDate = expiryDate;
  // the plan name is left exactly as it was — only length and end date change
  saveDB(DB);
  toast(zh ? '已修正并保存' : 'Fixed and saved');
  renderPlanCheck();
  renderNav();
}

// export helpers
function exportCustomersXlsx(){
  const rows = DB.customers.map(c=>({
    Name:c.name, Nationality:c.nationality, DOB:c.dob, Age:calcAge(c.dob),
    Phone:c.phone, Kakao:c.kakao, WeChat:c.wechat, IDType:c.idType, IDNumber:c.idNumber, IDExpiry:c.idExpiry,
    Occupation:c.occupation, Workplace:c.workplace, YearsInKorea:c.years, Referral:c.referral,
    CarrierType:c.carrierType, PlanType:c.planType, BranchOffice:c.branchOffice, SubType:c.subType,
    Rating:c.rating, Notes:c.notes,
  }));
  downloadXlsx(rows, 'Himobile_Customers.xlsx', 'Customers');
}
function exportOrdersXlsx(){
  const rows = DB.services.map(s=>{
    const c = getCustomer(s.customerId);
    return {Customer:c?c.name:'', Type:s.type, Carrier:s.carrier, Plan:s.plan, Number:s.number, SimType:s.simType,
      ActivationDate:s.activationDate, DurationDays:s.durationDays, ExpiryDate:s.expiryDate, Status:computedStatus(s),
      MonthlyFee:s.monthlyFee, Discount:s.discount, FirstMonthPayment:s.firstMonthPayment, ActivationFee:s.activationFee, SimFee:s.simFee,
      SellingPrice:s.sellingPrice, Cost:s.cost, Received:s.received, Outstanding:Math.max(0,(s.sellingPrice||0)-(s.received||0)),
      PaymentMethod:s.paymentMethod, Commission:s.commission, Notes:s.notes };
  });
  downloadXlsx(rows, 'Himobile_Orders.xlsx', 'Orders');
}
function exportRemindersXlsx(){
  const rows = buildReminders().map(r=>{
    const c = getCustomer(r.customerId);
    return {Customer:c?c.name:'', Type:r.type, DueDate:r.dueDate, DaysLeft:r.daysLeft, Status:r.uiStatus, Detail:r.sub};
  });
  downloadXlsx(rows, 'Himobile_Reminders.xlsx', 'Reminders');
}
function downloadXlsx(rows, filename, sheetName){
  if(!rows.length){ toast(LANG==='zh'?'没有可导出的数据':'No data to export'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
  toast(t('toast.exported'));
}
/* ---------------- unified export/import — matches Sheet View exactly ---------------- */
// One button, one file, two sheets (Prepaid / Postpaid) — every column exactly matches what
// Sheet View shows, in the same order, so what you see on screen is what you get in Excel.
// This replaces the old separate "export customers/orders/reminders/full backup" buttons —
// simpler, and (critically) round-trips cleanly through the matching import below, since the
// headers and field meanings are the same as this app already understands natively.
const PREPAID_EXPORT_HEADERS = ['CUSTOMER','NATIONALITY','PHONE','DATE OF BIRTH','ID TYPE','ID NUMBER',
  'OCCUPATION','YEARS IN KOREA','HANDLED BY','PLAN TYPE','CARRIER TYPE','COMPANY',
  'ACTIVATION DATE','EXPIRY DATE','CONTRACT LENGTH (DAYS)','PRICE','DISCOUNT','FINAL PRICE','PAYMENT METHOD','NOTES'];
const POSTPAID_EXPORT_HEADERS = ['CUSTOMER','NATIONALITY','PHONE','DATE OF BIRTH','ID TYPE','ID NUMBER',
  'OCCUPATION','YEARS IN KOREA','HANDLED BY','PLAN TYPE','CARRIER TYPE','COMPANY','PARTNER COMPANY',
  'ACTIVATION DATE','EXPIRY DATE','CONTRACT LENGTH (DAYS)','MONTHLY FEE','COMPANY PRICE','REAL COMPANY PRICE',
  'USIM FEE','DISCOUNT / MONTH','DISCOUNT MONTHS','EXPECTED INCOME','NOTES'];
function prepaidExportRow(c, s){
  const lab = planLengthLabel(s); // recharge plans are written as "Recharge" in PLAN TYPE (same rule as the CRM)
  return [c.name, c.nationality||'', c.phone||'', c.dob||'', c.idType||'', c.idNumber||'', c.occupation||'', c.years||0,
    c.handlerName||'', (lab && lab[0]==='rc') ? 'Recharge' : (c.planType||''), s.svcCarrierType||'', s.company||'',
    s.activationDate||'', s.expiryDate||'', s.durationDays||'', Number(s.price)||0, Number(s.discount)||0,
    Math.max(0,(Number(s.price)||0)-(Number(s.discount)||0)), s.paymentMethod||'', s.notes||''];
}
function postpaidExportRow(c, s){
  return [c.name, c.nationality||'', c.phone||'', c.dob||'', c.idType||'', c.idNumber||'', c.occupation||'', c.years||0,
    c.handlerName||'', c.workType||c.planType||'', s.svcCarrierType||'', s.company||'', s.partnerCompany||'',
    s.activationDate||'', s.expiryDate||'', s.durationDays||'', Number(s.monthlyFee)||0, Number(s.expectedProfit)||0,
    Number(s.actualProfit)||0, Number(s.usimFee)||0, Number(s.discountPerMonth)||0, Number(s.discountMonths)||0,
    expectedIncomeFor(s), s.notes||''];
}
function exportAll(){
  const prepaidRows = [PREPAID_EXPORT_HEADERS];
  const postpaidRows = [POSTPAID_EXPORT_HEADERS];
  DB.customers.forEach(c=>{
    customerServices(c.id).forEach(s=>{
      if(s.type==='prepaid') prepaidRows.push(prepaidExportRow(c, s));
      else if(s.type==='postpaid') postpaidRows.push(postpaidExportRow(c, s));
    });
  });
  // safety net: a header/row column-count mismatch silently shifts every value into the
  // wrong column (this happened once already — a missing phone number field shifted every
  // later column by one, corrupting activation dates and prices without any visible error)
  [['Prepaid', PREPAID_EXPORT_HEADERS, prepaidRows], ['Postpaid', POSTPAID_EXPORT_HEADERS, postpaidRows]].forEach(([label, headers, rows])=>{
    rows.slice(1).forEach((row,i)=>{
      if(row.length !== headers.length) console.error(`Export column mismatch on ${label} row ${i+1}: expected ${headers.length} columns, got ${row.length}`);
    });
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prepaidRows), 'Prepaid');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(postpaidRows), 'Postpaid');
  XLSX.writeFile(wb, `Himobile_Export_${todayISO()}.xlsx`);
  toast(t('toast.exported'));
}
/* The Reports page's own export — same Prepaid/Postpaid structure and full pricing detail
   as exportAll() above (Sheet View's exact columns), but scoped to whichever month is
   currently selected there, since a monthly report is usually what someone actually wants
   to hand off or file away, not the entire history every time. "All time" exports
   everything, same as the general export. */
function exportReportForMonth(){
  const isAllTime = repSelectedMonth==='all' || !repSelectedMonth;
  const prepaidRows = [PREPAID_EXPORT_HEADERS];
  const postpaidRows = [POSTPAID_EXPORT_HEADERS];
  DB.customers.forEach(c=>{
    customerServices(c.id).forEach(s=>{
      if(!isAllTime && (!s.activationDate || s.activationDate.slice(0,7)!==repSelectedMonth)) return;
      if(s.type==='prepaid') prepaidRows.push(prepaidExportRow(c, s));
      else if(s.type==='postpaid') postpaidRows.push(postpaidExportRow(c, s));
    });
  });
  if(prepaidRows.length===1 && postpaidRows.length===1){
    toast(LANG==='zh'?'该月份没有可导出的记录':'No records to export for this month');
    return;
  }
  [['Prepaid', PREPAID_EXPORT_HEADERS, prepaidRows], ['Postpaid', POSTPAID_EXPORT_HEADERS, postpaidRows]].forEach(([label, headers, rows])=>{
    rows.slice(1).forEach((row,i)=>{
      if(row.length !== headers.length) console.error(`Export column mismatch on ${label} row ${i+1}: expected ${headers.length} columns, got ${row.length}`);
    });
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prepaidRows), 'Prepaid');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(postpaidRows), 'Postpaid');
  const label = isAllTime ? 'AllTime' : repSelectedMonth;
  XLSX.writeFile(wb, `Himobile_Report_${label}.xlsx`);
  toast(t('toast.exported'));
}
/* Recognizes this app's own export by its distinctive header combination (real carrier
   spreadsheets never have "Final Price" or "Real Company Price" columns) — when detected,
   restores directly by exact field position instead of guessing column meaning the way the
   general importer does for messy real-world files. This is what lets ONE import button
   correctly handle both this app's own export AND an unrelated carrier spreadsheet. */
function looksLikeOwnExportSheet(headerRow){
  const h = (headerRow||[]).map(v=>String(v||'').trim().toUpperCase());
  return h.includes('FINAL PRICE') || h.includes('REAL COMPANY PRICE');
}
function restoreOwnExportSheet(sheetName, rows){
  const isPrepaid = sheetName==='Prepaid';
  let added = 0;
  rows.forEach(rawRow=>{
    // case-insensitive field lookup — works whether the file has the current ALL CAPS
    // headers or an older export's Title Case headers, without needing two code paths
    const norm = {};
    Object.keys(rawRow).forEach(k=> norm[k.trim().toUpperCase()] = rawRow[k]);
    const row = norm;
    const name = String(row['CUSTOMER']||'').trim();
    if(!name) return;
    let cust = DB.customers.find(c=>c.name.toUpperCase()===name.toUpperCase() && (c.phone||'')===String(row['PHONE']||'').trim());
    if(!cust){
      cust = {
        id: uid('c'), name: name.toUpperCase(), nationality: String(row['NATIONALITY']||'').toUpperCase(),
        dob: normDateForImport(row['DATE OF BIRTH']), phone: String(row['PHONE']||'').trim(),
        idType: row['ID TYPE']||'ARC', idNumber: String(row['ID NUMBER']||'').toUpperCase(),
        occupation: row['OCCUPATION']||'', years: Number(row['YEARS IN KOREA'])||0,
        handlerName: row['HANDLED BY']||'', planType: row['PLAN TYPE']||'신규가입',
        workType: !isPrepaid ? (row['PLAN TYPE']||'신규가입') : undefined,
        subType: isPrepaid?'prepaid':'postpaid', referral:'other', carrierType:'SKT',
        // the export's "NOTES" column is the service/plan-level notes field, not this
        // customer-level one (a separate field, e.g. set via Edit Profile) — those aren't
        // part of this export format at all, so this stays blank for a newly-created
        // customer rather than incorrectly pulling in the service-level note instead
        address:'', notes:'', rating:5, createdAt: normDateForImport(row['ACTIVATION DATE'])||todayISO(),
      };
      DB.customers.push(cust);
    }
    const activationDate = normDateForImport(row['ACTIVATION DATE'])||todayISO();
    const expiryDate = normDateForImport(row['EXPIRY DATE'])||'';
    // "Carrier" and "Carrier Type" were merged into one column (Carrier Type) — populate
    // both internal fields from it, so the rest of the app (forms, Sheet View, print
    // templates) that still reference either one keeps working exactly as before
    const carrierType = row['CARRIER TYPE']||'';
    const base = {
      customerId: cust.id, type: isPrepaid?'prepaid':'postpaid', carrier: carrierType,
      svcCarrierType: carrierType, company: row['COMPANY']||'',
      number: cust.phone, simType:'physical', activationDate, expiryDate,
      durationDays: Number(row['CONTRACT LENGTH (DAYS)'])||null, status:'active', notes: row['NOTES']||'',
    };
    const svcData = isPrepaid ? {
      ...base, price: Number(row['PRICE'])||0, discount: Number(row['DISCOUNT'])||0,
      sellingPrice: Number(row['FINAL PRICE'])||0, received: Number(row['FINAL PRICE'])||0,
      cost:0, commission:0, paymentMethod: normPaymentMethod(row['PAYMENT METHOD']), monthlyFee:0, firstMonthPayment:0, activationFee:0, simFee:0,
    } : {
      ...base, partnerCompany: row['PARTNER COMPANY']||'', monthlyFee: Number(row['MONTHLY FEE'])||0,
      expectedProfit: Number(row['COMPANY PRICE'])||0, actualProfit: Number(row['REAL COMPANY PRICE'])||0,
      usimFee: Number(row['USIM FEE'])||0, discountPerMonth: Number(row['DISCOUNT / MONTH'])||0,
      discountMonths: Number(row['DISCOUNT MONTHS'])||0, sellingPrice:0, cost:0, received:0,
      commission:0, paymentMethod:'', firstMonthPayment:0, activationFee:0, simFee:0, discount:0,
    };
    setActiveSubscription(cust.id, svcData, 'new');
    added++;
  });
  return added;
}
// Matches whatever's in the Excel cell against the known payment method values, case- and
// whitespace-insensitively — blank or unrecognized (e.g. a manually-typed variant) stays
// blank rather than being guessed at, same principle as every other blank default here.
function normPaymentMethod(v){
  const norm = String(v||'').trim().toLowerCase();
  return PAYMENT_METHODS.includes(norm) ? norm : '';
}
function normDateForImport(v){
  if(v==null || v==='') return '';
  if(isIsoDate(v)) return String(v).slice(0,10);
  return parseFlexibleDate(v)||'';
}

// import
let pendingImportRows = [];
let pendingWorkbook = null;
let pendingSheetName = '';
let pendingHeaderRowIdx = 0; // 0-based index into the raw sheet rows
let checkedImportSheets = []; // sheet names currently checked in the multi-select checklist
function handleImportFile(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      if(!wb.SheetNames.length){ toast(LANG==='zh'?'文件中没有数据':'No data found in file'); return; }
      pendingWorkbook = wb;
      // default-check every sheet that actually looks like customer data (skip calculator/
      // helper tabs) — this is what lets prepaid + postpaid import together in one go without
      // the user having to hunt for and tick each one manually
      const dataSheets = wb.SheetNames.filter(n=> !/计算器|智能表/.test(n));
      checkedImportSheets = dataSheets.length ? [...dataSheets] : [wb.SheetNames[0]];
      renderImportSheetChecklist();
      updateImportSheetSelectionUI();
    }catch(err){
      toast(LANG==='zh'?'文件解析失败':'Failed to parse file');
    }
  };
  reader.readAsArrayBuffer(file);
}
function renderImportSheetChecklist(){
  const el = document.getElementById('importSheetChecklist');
  el.innerHTML = pendingWorkbook.SheetNames.map(name=>{
    const checked = checkedImportSheets.includes(name);
    let rowCount = '';
    try{
      const aoa = XLSX.utils.sheet_to_json(pendingWorkbook.Sheets[name], {header:1, defval:''});
      const headerIdx = detectHeaderRowIndex(aoa);
      rowCount = rowsFromHeaderIndex(aoa, headerIdx).length;
    }catch(e){}
    return `<label class="sheet-select-tile ${checked?'checked':''}" data-sheet-name="${escapeHtml(name)}">
      <input type="checkbox" ${checked?'checked':''}>
      ${escapeHtml(name)} ${rowCount!==''?`<span class="n">(${rowCount})</span>`:''}
    </label>`;
  }).join('');
  el.querySelectorAll('.sheet-select-tile').forEach(tile=>{
    tile.addEventListener('click', e=>{
      e.preventDefault();
      const name = tile.dataset.sheetName;
      if(checkedImportSheets.includes(name)) checkedImportSheets = checkedImportSheets.filter(n=>n!==name);
      else checkedImportSheets.push(name);
      tile.classList.toggle('checked');
      tile.querySelector('input').checked = checkedImportSheets.includes(name);
      updateImportSheetSelectionUI();
    });
  });
}
/* Single sheet checked → show the full detailed preview grid with manual header-row/type
   overrides (existing behavior). 2+ sheets checked → each is auto-detected independently
   (header row + prepaid/postpaid) and summarized in a compact list instead, since a single
   data grid can't meaningfully preview sheets with completely different columns. */
function updateImportSheetSelectionUI(){
  const single = checkedImportSheets.length===1;
  document.getElementById('importSingleSheetControls').style.display = single ? '' : 'none';
  document.getElementById('importPreviewTable').parentElement.style.display = single ? '' : 'none';
  document.getElementById('importMultiSheetSummary').style.display = single ? 'none' : '';
  if(!checkedImportSheets.length){
    document.getElementById('importInfo').textContent = LANG==='zh' ? '请至少选择一个表格' : 'Select at least one sheet to import';
    document.getElementById('importMultiSheetSummary').innerHTML = '';
    document.getElementById('importModalOverlay').classList.add('show');
    return;
  }
  if(single){
    loadSheetForImport(checkedImportSheets[0], null);
    return;
  }
  document.getElementById('importInfo').textContent = '';
  document.getElementById('importNameWarning').style.display = 'none';
  document.getElementById('importMultiSheetSummary').innerHTML = checkedImportSheets.map(name=>{
    const aoa = XLSX.utils.sheet_to_json(pendingWorkbook.Sheets[name], {header:1, defval:''});
    const headerIdx = detectHeaderRowIndex(aoa);
    const rows = rowsFromHeaderIndex(aoa, headerIdx);
    const detectedType = guessSubTypeFromSheetName(name);
    const typeLabel = detectedType==='postpaid' ? (LANG==='zh'?'后付卡':'Postpaid') : (LANG==='zh'?'先付卡':'Prepaid');
    const sampleHasName = rows.slice(0,10).some(r=> guessField(r, NAME_GUESS_KEYS));
    return `<div class="service-card" style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <b>${escapeHtml(name)}</b>
        <span class="pill ${detectedType==='postpaid'?'pill-blue':'pill-orange'}">${typeLabel}</span>
      </div>
      <div class="muted" style="font-size:12px;margin-top:4px;">${rows.length} ${t('io.rows')} · ${LANG==='zh'?'第':'row'} ${headerIdx+1} ${LANG==='zh'?'行为标题行':'used as header row'}</div>
      ${!sampleHasName ? `<div style="color:#C0392B;font-size:12px;margin-top:4px;">⚠ ${LANG==='zh'?'未找到姓名列，此表格可能不会新增客户':"Couldn't find a name column — this sheet may add nothing"}</div>` : ''}
    </div>`;
  }).join('');
  document.getElementById('importModalOverlay').classList.add('show');
}
/* Many real-world spreadsheets have a title/merged-cell row above the actual column headers.
   Auto-detect the real header row as the row (within the first 10) with the most non-empty cells,
   instead of blindly assuming row 1 is the header — this is what was silently breaking imports. */
function detectHeaderRowIndex(aoa){
  let bestIdx = 0, bestCount = -1;
  const scanLimit = Math.min(10, aoa.length);
  for(let i=0;i<scanLimit;i++){
    const row = aoa[i] || [];
    const count = row.filter(v=> v!==null && v!==undefined && String(v).trim()!=='').length;
    if(count > bestCount){ bestCount = count; bestIdx = i; }
  }
  return bestIdx;
}
function rowsFromHeaderIndex(aoa, headerIdx){
  const headerRow = aoa[headerIdx] || [];
  const cols = headerRow.map((h,i)=> (h!==null && h!==undefined && String(h).trim()!=='') ? String(h).trim() : `_col${i+1}`);
  const rows = [];
  for(let r=headerIdx+1; r<aoa.length; r++){
    const raw = aoa[r] || [];
    if(raw.every(v=> v===null || v===undefined || String(v).trim()==='')) continue; // skip blank rows
    const obj = {};
    cols.forEach((c,i)=>{ obj[c] = raw[i]!==undefined && raw[i]!==null ? raw[i] : ''; });
    rows.push(obj);
  }
  return rows;
}
/* Guess whether a sheet holds prepaid or postpaid customers from its name/tab title,
   e.g. "2026PRE" -> prepaid, "后付长期卡POST" -> postpaid. Defaults to prepaid if unclear. */
function guessSubTypeFromSheetName(name){
  const s = String(name||'');
  if(/post|后付|후불/i.test(s)) return 'postpaid';
  if(/pre(?!sent)|先付|선불/i.test(s)) return 'prepaid';
  return 'prepaid';
}
function loadSheetForImport(sheetName, manualHeaderIdx){
  pendingSheetName = sheetName;
  const sheet = pendingWorkbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(sheet, {header:1, defval:''});
  const headerIdx = manualHeaderIdx!=null ? manualHeaderIdx : detectHeaderRowIndex(aoa);
  pendingHeaderRowIdx = headerIdx;
  document.getElementById('importHeaderRow').value = headerIdx+1;
  document.getElementById('importSubType').value = 'auto';
  const rows = rowsFromHeaderIndex(aoa, headerIdx);
  pendingImportRows = rows;
  showImportPreview(rows);
}
document.getElementById('importHeaderRow').addEventListener('change', e=>{
  const idx = Math.max(0, (Number(e.target.value)||1) - 1);
  if(pendingWorkbook) loadSheetForImport(pendingSheetName, idx);
});
function showImportPreview(rows){
  if(!rows.length){
    document.getElementById('importInfo').textContent = LANG==='zh' ? '此表格中没有可导入的数据行' : 'No data rows found in this sheet';
    document.getElementById('importPreviewTable').innerHTML = '';
    document.getElementById('importNameWarning').style.display = 'none';
    document.getElementById('importModalOverlay').classList.add('show');
    return;
  }
  const cols = Object.keys(rows[0]);
  const detectedType = guessSubTypeFromSheetName(pendingSheetName);
  const typeLabel = detectedType==='postpaid' ? (LANG==='zh'?'后付卡':'Postpaid') : (LANG==='zh'?'先付卡':'Prepaid');
  document.getElementById('importInfo').textContent = `${rows.length} ${t('io.rows')} · ${cols.length} ${LANG==='zh'?'列':'columns'} ${t('io.detected')} (${LANG==='zh'?'第':'row'} ${pendingHeaderRowIdx+1} ${LANG==='zh'?'行为标题行':'used as header row'}) · ${LANG==='zh'?'检测到':'detected as'}: ${typeLabel}`;
  const head = '<thead><tr>'+cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')+'</tr></thead>';
  const body = '<tbody>'+rows.slice(0,30).map(r=>'<tr>'+cols.map(c=>`<td>${escapeHtml(r[c])}</td>`).join('')+'</tr>').join('')+'</tbody>';
  document.getElementById('importPreviewTable').innerHTML = head+body;
  document.getElementById('importMode_merge').checked = true;
  document.getElementById('importSkipDupes').checked = true;
  updateImportSkipDupesUI();
  // sanity check: warn up front if we can't find a name column, so it's obvious before confirming
  const sampleHasName = rows.slice(0,10).some(r=> guessField(r, NAME_GUESS_KEYS));
  const warnEl = document.getElementById('importNameWarning');
  if(!sampleHasName){
    warnEl.style.display = '';
    warnEl.textContent = LANG==='zh'
      ? '⚠ 未能在此标题行中找到客户姓名列，导入可能不会新增任何客户。请检查上方「标题行」是否正确，或换一个表格 (Sheet)。'
      : "⚠ Couldn't find a customer-name column using this header row — import may add nothing. Check the header row number above, or try a different sheet.";
  } else {
    warnEl.style.display = 'none';
  }
  document.getElementById('importModalOverlay').classList.add('show');
}
const NAME_GUESS_KEYS = ['name','customername','客户姓名','姓名','客户名'];
/* Real-world sheets often store ID type as a mixed Korean/English tag like "등록증ARC" or "여권Ps" —
   normalize to a clean ARC/Passport value so it matches the app's dropdown. */
function normalizeIdType(raw){
  const s = String(raw||'');
  if(/passport|여권|ps\b/i.test(s)) return 'Passport';
  if(/arc|등록증|외국인등록/i.test(s)) return 'ARC';
  return s ? s : 'ARC';
}
function guessField(row, keys){
  const rowKeys = Object.keys(row);
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
  // pass 1: normalized exact match — handles headers with an embedded English word, e.g. "客户名Name"
  for(const k of keys){
    const nk = norm(k);
    if(!nk) continue;
    const found = rowKeys.find(rk => norm(rk) === nk);
    if(found && row[found]!=='') return row[found];
  }
  // pass 2: raw substring match — handles headers that are pure Chinese/Korean with no English word
  for(const k of keys){
    const found = rowKeys.find(rk => rk.includes(k));
    if(found && row[found]!=='') return row[found];
  }
  return '';
}
// Real-world spreadsheets often format money as text with a currency symbol and thousands
// separators (e.g. "₩65,000") — Number() on that string alone returns NaN. Strips everything
// except digits, minus sign, and decimal point before parsing.
function guessNumber(row, keys){
  const raw = guessField(row, keys);
  if(raw===''||raw==null) return 0;
  if(typeof raw==='number') return raw;
  const cleaned = String(raw).replace(/[^0-9.-]/g,'');
  return cleaned==='' ? 0 : (Number(cleaned)||0);
}
/* Parses a "contract length" cell into a day count, tolerating the unit-word formats real
   spreadsheets actually use — "30일" (Korean "30 days"), "1개월"/"1달" (Korean "1 month"),
   "3个月" (Chinese "3 months"), "30 days", "1 month" — not just a bare number. A plain
   Number() on any of these returns NaN, which previously made the importer treat the whole
   cell as "no duration info at all" and silently default to the longest (90-day) prepaid
   tier — the worst possible guess, and the reason a customer who was actually sold a 30-day
   plan (written in the sheet as "30일") could come out of import looking like a 3-month
   customer. A bare number is still assumed to already be in days, exactly as before. */
function parseDurationDaysFlexible(raw){
  if(raw===''||raw==null) return NaN;
  if(typeof raw==='number') return raw;
  const s = String(raw).trim();
  const bare = Number(s);
  if(!isNaN(bare)) return bare; // plain "30" — already a day count, no unit text to strip
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)/);
  if(!m) return NaN;
  const n = Number(m[1]);
  if(/개월|달|月|month/i.test(s)) return n*30;
  if(/년|年|year/i.test(s)) return n*365;
  if(/주|주일|week/i.test(s)) return n*7;
  // "일"/"日"/"day(s)" or no recognizable unit at all — treat the number as already-days
  return n;
}
/* Finds the CONTRACT-length cell of an imported row. The old lookup used loose keywords
   including "已使用天" (days USED) and a bare "天数" (days) that also matches "剩余天数"
   (days LEFT) — so on a sheet with no contract-days column, a 3-month customer who had used
   ~30 days was imported as a 30-day plan. Used/remaining/left columns are now never read. */
const CONTRACT_DAYS_EXCLUDE = /已使用|使用|剩余|剩|还有|used|remain|left|사용|남은|잔여/i;
function guessContractDaysCell(row){
  const keys = Object.keys(row);
  const ok = k => !CONTRACT_DAYS_EXCLUDE.test(k) && row[k]!=='' && row[k]!=null;
  const strong = keys.find(k=> ok(k) && /contract\s*(days|length)|contractdays|合同天数|合约天数|套餐天数|合同期|계약일수|계약기간|약정/i.test(k));
  if(strong) return row[strong];
  const weak = keys.find(k=> ok(k) && /天数|일수|duration|^days$/i.test(k.trim()));
  return weak ? row[weak] : '';
}
/* Day count stated in a plan name — "3个月", "3개월 충전", "90일", "1 month", "15天".
   Requires a unit word, so names like "Korea 90" or "PLAN A" are not guessed at. */
function planTextDays(plan){
  const s = String(plan||'').trim();
  if(!s) return 0;
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*(개월|个月|個月|달|月|months?|일|日|天|days?)/i);
  if(!m) return 0;
  const n = Number(m[1]);
  return /개월|个月|個月|달|月|month/i.test(m[2]) ? Math.round(n*30) : Math.round(n);
}
function updateImportSkipDupesUI(){
  const mode = document.querySelector('input[name="importMode"]:checked')?.value || 'merge';
  const skip = document.getElementById('importSkipDupes').checked;
  const wrap = document.getElementById('importSkipDupeWrap');
  const isReplace = mode === 'replace';
  wrap.style.opacity = isReplace ? '.45' : '1';
  document.getElementById('importSkipDupes').disabled = isReplace;
  const hint = document.getElementById('importSkipDupesHint');
  if(isReplace){
    hint.textContent = LANG==='zh' ? '（清空模式下所有记录都会重新载入，此选项不适用）' : '(not applicable in replace mode — everything is reloaded fresh)';
  } else if(skip){
    hint.textContent = LANG==='zh'
      ? '按姓名或电话匹配到已存在客户时会跳过，不新增；但会更正其先付/后付标签'
      : 'Rows matching an existing customer (by name or phone) are skipped, not added — but their prepaid/postpaid tag will still be corrected if wrong';
  } else {
    hint.textContent = LANG==='zh'
      ? '⚠ 不会检查重复，文件中每一行都会作为新客户导入，即使姓名或电话已存在'
      : '⚠ No duplicate check — every row will be imported as a new customer, even if the name or phone already exists';
  }
}
document.querySelectorAll('input[name="importMode"]').forEach(el=> el.addEventListener('change', updateImportSkipDupesUI));
document.getElementById('importSkipDupes').addEventListener('change', updateImportSkipDupesUI);

/* Imports one sheet's already-parsed rows into DB.customers/DB.services. Extracted from
   confirmImport so the same logic can run once per sheet when multiple sheets are selected
   (e.g. prepaid + postpaid together), each resolving its own subtype/header row. */
function importRowsIntoDB(rows, sheetName, subTypeChoice, skipDupes){
  let added = 0, dupes = 0, retagged = 0;
  const resolvedSubType = subTypeChoice==='auto' ? guessSubTypeFromSheetName(sheetName) : subTypeChoice;
  rows.forEach(row=>{
    const name = guessField(row, NAME_GUESS_KEYS);
    if(!name) return;
    const phone = guessField(row,['phone','contact','联系电话','电话','phonenumber','开通号码','号码']);
    const existing = skipDupes ? DB.customers.find(c=> c.name.toLowerCase()===String(name).toLowerCase() || (phone && c.phone===String(phone))) : null;
    if(existing){
      dupes++;
      // self-heal: if this customer was previously imported with the wrong prepaid/postpaid tag
      // (e.g. from before per-sheet type detection existed), fix it on re-import rather than
      // silently skipping — otherwise re-importing never corrects already-stored records.
      if(existing.subType !== resolvedSubType){
        existing.subType = resolvedSubType;
        DB.services.filter(s=>s.customerId===existing.id).forEach(s=>{
          if(s.type==='prepaid' || s.type==='postpaid') s.type = resolvedSubType;
        });
        retagged++;
      }
      return;
    }
    const rawIdType = guessField(row,['idtype','证件类型','证件id','证件']);
    const cust = {
      id:uid('c'), name:String(name), phone:String(phone||''),
      nationality:String(guessField(row,['nationality','国籍','国家'])||'OTHER').toUpperCase(),
      dob:parseDobFlexible(guessField(row,['dob','dateofbirth','出生日期','生年月'])),
      kakao:String(guessField(row,['kakao','kakaotalk'])||''),
      wechat:String(guessField(row,['wechat','微信'])||''),
      idType:normalizeIdType(rawIdType),
      idNumber:String(guessField(row,['idnumber','证件号码','证件号'])||''),
      idExpiry:parseFlexibleDate(guessField(row,['idexpiry','证件有效期'])),
      occupation:String(guessField(row,['occupation','职业','school','学校','身份'])||''),
      workplace:String(guessField(row,['workplace','工作单位'])||''),
      years:Number(guessField(row,['yearsinkorea','在韩年数','在韩年']))||0,
      referral:String(guessField(row,['referral','来源','介绍人'])||'other'),
      carrierType:String(guessField(row,['carriertype','通信网'])||'SKT').toUpperCase(),
      planType:String(guessField(row,['plantype','业务类型','业务向'])||'신규가입'),
      branchOffice:String(guessField(row,['branchoffice','接收处管理编码'])||''),
      subType:resolvedSubType,
      address:String(guessField(row,['address','地址'])||''),
      notes:String(guessField(row,['notes','备注','客户备注'])||''),
      rating:Number(guessField(row,['rating','评分','客户星级']))||3,
      handlerName:String(guessField(row,['handlername','办理人','担当者'])||''),
    };
    DB.customers.push(cust);
    cust.workType = String(guessField(row,['worktype','业务向','업무향'])||'');
    const plan = guessField(row,['plan','套餐']);
    const carrier = guessField(row,['carrier','통신사','통신社','签约公司','开通社']);
    const rawDurationDays = guessContractDaysCell(row);
    let durationDays;
    // Was the duration actually read off the sheet, or did we have to fall back to a
    // default because that column was blank/unparseable? This distinction matters below —
    // a duration we genuinely parsed is more trustworthy than whatever the sheet's own
    // "Expiry Date" column says, since that column is very often stale (left over from an
    // old plan, copy-pasted from a template, or never updated when the plan tier changed).
    let parsedDays = parseDurationDaysFlexible(rawDurationDays);
    const parsedDurationOk = parsedDays > 0;
    // No real contract-length column: before falling back to a default, use what the row
    // itself says — the plan name ("3个月", "90일", "1 month") or, failing that, the gap
    // between the sheet's own activation and expiry dates.
    if(!(parsedDays > 0)){
      const fromPlan = planTextDays(plan);
      if(fromPlan) parsedDays = fromPlan;
      else {
        const a0 = parseFlexibleDate(guessField(row,['activationdate','开通日期','开通日']));
        const e0 = parseFlexibleDate(guessField(row,['expirydate','到期日期','有效使用期']));
        if(a0 && e0 && e0 > a0) parsedDays = daysBetween(a0, e0);
      }
    }
    if(resolvedSubType==='prepaid'){
      // real prepaid plans come in 15/30/60/90-day tiers — snap to the nearest one instead
      // of assuming every prepaid signup is 90 days regardless of what the sheet says
      const tiers = PREPAID_PLANS.map(p=>p.days);
      durationDays = parsedDays > 0 ? tiers.reduce((best,v)=>Math.abs(v-parsedDays)<Math.abs(best-parsedDays)?v:best, tiers[0]) : tiers[tiers.length-1];
    } else {
      durationDays = parsedDays > 0 ? POSTPAID_CONTRACT_DAYS.reduce((best,v)=>Math.abs(v-parsedDays)<Math.abs(best-parsedDays)?v:best, POSTPAID_CONTRACT_DAYS[0]) : POSTPAID_CONTRACT_DAYS[0];
    }
    if(plan || carrier){
      const importedActivationDate = parseFlexibleDate(guessField(row,['activationdate','开通日期','开通日']))||todayISO();
      const importedExpiryDate = parseFlexibleDate(guessField(row,['expirydate','到期日期','有效使用期']));
      const computedFromDuration = (()=>{
        const d = new Date(importedActivationDate); d.setDate(d.getDate()+durationDays);
        return d.toISOString().slice(0,10);
      })();
      // BUG FIX: this used to trust the sheet's own "Expiry Date" column whenever one was
      // present, and only computed activation+duration as a fallback for blank cells. That
      // meant a row whose Contract Days column correctly said "30" but whose Expiry Date
      // column still held a stale 3-month-out date (a very common spreadsheet mistake —
      // that cell was never updated after the plan tier changed) imported BOTH values as-is,
      // so the customer's profile showed a 30-day plan with a 90-day-out expiry.
      // Now: whenever we genuinely parsed a duration from the sheet, activation date + that
      // duration is treated as the source of truth and the Expiry Date column is ignored —
      // it's only consulted when there's no usable duration to compute from at all.
      const computedExpiryDate = parsedDurationOk ? computedFromDuration : (importedExpiryDate || computedFromDuration);
      const baseFields = {
        type:resolvedSubType, carrier:String(carrier||''), plan:String(plan||''),
        number:String(guessField(row,['number','号码','currentnumber','开通号码'])||''), simType:'physical',
        activationDate:importedActivationDate, durationDays,
        expiryDate:computedExpiryDate, status:'active', notes:'', paymentMethod:'', commission:0,
        company:String(guessField(row,['company','가입회사','开通社','通信公司'])||''),
        partnerCompany:String(guessField(row,['partnercompany','签约公司','파트너사'])||''),
        svcCarrierType:String(guessField(row,['carriertype','통신사','통신사長신사','通信社'])||''),
      };
      // routes through the same enforcement path as every other subscription change, so the
      // imported record is immediately recognized as active — without this, imported customers
      // silently show "No active subscription" everywhere (including Sheet View) until the next
      // page reload triggers the self-heal migration
      let svcData;
      if(resolvedSubType==='prepaid'){
        // Real spreadsheets track price and discount as separate columns that together
        // explain the final amount received (e.g. price 70,000 minus a 5,000 discount =
        // 65,000 received) — reading price/discount directly and computing the final price
        // ourselves is more reliable than trying to parse a "received" column that's often
        // formatted as currency text (e.g. "₩65,000", which Number() alone can't parse).
        const price = guessNumber(row, ['price','价格','金额']);
        const discount = Math.abs(guessNumber(row, ['discount','支出','团体折扣','优惠']));
        svcData = {
          ...baseFields, price, discount, sellingPrice:Math.max(0, price-discount), received:Math.max(0, price-discount),
          cost:0, monthlyFee:0, firstMonthPayment:0, activationFee:0, simFee:0,
        };
      } else {
        svcData = {
          ...baseFields,
          monthlyFee:guessNumber(row, ['monthlyfee','月租','월세']),
          discount:guessNumber(row, ['discount','月租优惠','优惠']),
          firstMonthPayment:guessNumber(row, ['amount','金额','价格','实收']),
          sellingPrice:guessNumber(row, ['amount','金额','价格','实收']),
          received:guessNumber(row, ['amount','金额','价格','实收']),
          activationFee:0, simFee:0,
        };
      }
      setActiveSubscription(cust.id, svcData, 'new');
    }
    added++;
  });
  return {added, dupes, retagged};
}
function confirmImport(){
  const mode = document.querySelector('input[name="importMode"]:checked')?.value || 'merge';
  if(mode === 'replace'){
    if(DB.customers.length){
      if(!confirm(LANG==='zh'
        ? `即将清空现有 ${DB.customers.length} 位客户及其业务记录，并改用此文件的数据。系统会先自动导出一份备份 Excel。是否继续？`
        : `This will clear the existing ${DB.customers.length} customers and their orders, then load this file instead. A backup Excel will be exported automatically first. Continue?`)){
        return;
      }
      try{
        exportAll();
      }catch(err){
        toast(LANG==='zh' ? '备份导出失败，为安全起见已取消导入，现有数据未被清空' : 'Backup export failed — import cancelled for safety, existing data was not cleared');
        return;
      }
    }
    DB.customers = [];
    DB.services = [];
  }
  const skipDupes = mode === 'merge' && document.getElementById('importSkipDupes').checked;
  let added = 0, dupes = 0, retagged = 0;
  const perSheetResults = [];
  if(checkedImportSheets.length===1){
    // single-sheet mode respects the manual header-row/type overrides shown in the form —
    // except when this app's own export format is detected, which always takes priority
    // since it doesn't need any of those manual overrides (everything is already unambiguous)
    if(looksLikeOwnExportSheet(Object.keys(pendingImportRows[0]||{}))){
      const n = restoreOwnExportSheet(pendingSheetName, pendingImportRows);
      added += n;
      perSheetResults.push({name:pendingSheetName, added:n, dupes:0, retagged:0});
    } else {
      const subTypeChoice = document.getElementById('importSubType').value;
      const r = importRowsIntoDB(pendingImportRows, pendingSheetName, subTypeChoice, skipDupes);
      added+=r.added; dupes+=r.dupes; retagged+=r.retagged;
      perSheetResults.push({name:pendingSheetName, ...r});
    }
  } else {
    // multi-sheet mode: each sheet is parsed and auto-detected fresh and independently —
    // this is what lets prepaid + postpaid (or any combination) import together in one go,
    // and each sheet is checked for this app's own export format before falling back to the
    // general column-guessing importer meant for messy real-world carrier spreadsheets
    checkedImportSheets.forEach(sheetName=>{
      const aoa = XLSX.utils.sheet_to_json(pendingWorkbook.Sheets[sheetName], {header:1, defval:''});
      const headerIdx = detectHeaderRowIndex(aoa);
      const rows = rowsFromHeaderIndex(aoa, headerIdx);
      if(looksLikeOwnExportSheet(aoa[headerIdx])){
        const n = restoreOwnExportSheet(sheetName, rows);
        added += n;
        perSheetResults.push({name:sheetName, added:n, dupes:0, retagged:0});
      } else {
        const r = importRowsIntoDB(rows, sheetName, 'auto', skipDupes);
        added+=r.added; dupes+=r.dupes; retagged+=r.retagged;
        perSheetResults.push({name:sheetName, ...r});
      }
    });
  }
  renamePartnerCompanies(DB); // older Excel files still say LG本社 / SK本社
  saveDB(DB);
  closeAllModals();
  const perSheetHtml = perSheetResults.length>1 ? perSheetResults.map(r=>
    `<div class="section-desc" style="margin-top:4px;">${escapeHtml(r.name)}: ${r.added} ${LANG==='zh'?'已导入':'imported'}, ${r.dupes} ${LANG==='zh'?'重复':'dupes'}${r.retagged?`, ${r.retagged} ${LANG==='zh'?'已更正':'corrected'}`:''}</div>`
  ).join('') : '';
  document.getElementById('importSummary').innerHTML = `<div class="pill pill-green" style="margin-top:12px;">${added} ${LANG==='zh'?'条已导入':'imported'}</div> <div class="pill pill-gray" style="margin-top:12px;">${dupes} ${LANG==='zh'?'条重复已跳过':'duplicates skipped'}</div>` + (retagged ? ` <div class="pill pill-blue" style="margin-top:12px;">${retagged} ${LANG==='zh'?'条已更正开通方式（先付/后付）':'had their prepaid/postpaid tag corrected'}</div>` : '') + perSheetHtml;
  toast(t('toast.imported'));
  renderPage(currentPage);
  renderNav();
}

/* ================= PRINT TEMPLATES & AUTO-FILL PRINTING ================= */

/* merge fields available for placement on a template */
const MERGE_FIELDS = [
  ['customer.name', {zh:'客户姓名', en:'Customer name'}],
  ['customer.dob', {zh:'出生日期', en:'Date of birth'}],
  ['customer.dobShort', {zh:'出生日期（6位 YYMMDD）', en:'Date of birth (6-digit YYMMDD)'}],
  ['customer.age', {zh:'年龄', en:'Age'}],
  ['customer.nationality', {zh:'国籍', en:'Nationality'}],
  ['customer.idType', {zh:'证件类型', en:'ID type'}],
  ['customer.idNumber', {zh:'证件号码', en:'ID number'}],
  ['customer.idExpiry', {zh:'证件有效期', en:'ID expiry date'}],
  ['customer.phone', {zh:'联系电话', en:'Phone number'}],
  ['customer.kakao', {zh:'KakaoTalk', en:'KakaoTalk ID'}],
  ['customer.wechat', {zh:'微信', en:'WeChat'}],
  ['customer.address', {zh:'地址', en:'Address'}],
  ['customer.occupation', {zh:'职业', en:'Occupation'}],
  ['customer.workplace', {zh:'工作单位', en:'Workplace'}],
  ['customer.carrierType', {zh:'通信网 (SKT/KT)', en:'Carrier network (SKT/KT)'}],
  ['customer.planType', {zh:'业务类型 (업무구분)', en:'Plan type (업무구분)'}],
  ['customer.branchOffice', {zh:'接收处管理编码', en:'Branch office code'}],
  ['service.carrier', {zh:'通信社', en:'Carrier'}],
  ['service.plan', {zh:'套餐名称', en:'Plan'}],
  ['service.number', {zh:'电话号码', en:'Phone number (service)'}],
  ['service.usimNumber', {zh:'USIM 일련번호', en:'USIM serial number'}],
  ['service.activationDate', {zh:'开通日期', en:'Activation date'}],
  ['service.expiryDate', {zh:'到期日期', en:'Expiry date'}],
  ['service.durationDays', {zh:'合同时长（天）', en:'Duration (days)'}],
  ['store.name', {zh:'门店名称', en:'Store name'}],
  ['today.date', {zh:'今天日期', en:"Today's date"}],
  ['custom.text', {zh:'自定义文字', en:'Custom text'}],
];
function mergeFieldLabel(key){ const f = MERGE_FIELDS.find(m=>m[0]===key); return f ? (f[1][LANG]||f[1].zh) : key; }
/* Formats an ISO date (YYYY-MM-DD) as a 6-digit YYMMDD string, as used on Korean ID-style forms */
function toYYMMDD(isoDate){
  if(!isoDate) return '';
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return '';
  return m[1].slice(2)+m[2]+m[3];
}
function resolveMergeValue(key, customer, service, customText){
  if(key==='custom.text') return customText || '';
  if(key==='store.name') return '365Himobile';
  if(key==='today.date') return todayISO();
  if(key==='customer.dobShort') return toYYMMDD(customer?.dob);
  const [scope, field] = key.split('.');
  const obj = scope==='customer' ? customer : (scope==='service' ? service : null);
  if(!obj) return '';
  if(scope==='customer' && field==='age'){ const a = calcAge(obj.dob); return a===null?'':String(a); }
  if(scope==='customer' && field==='idType') return t('idtype.'+obj.idType) || obj.idType || '';
  let v = obj[field];
  return v==null ? '' : String(v);
}

/* 프리티텔레콤 (Preeti Telecom) prepaid application form — seeded print template.
   Address and data plan are fixed per store policy; only the fields below are editable per customer.
   All fields share one font size for a consistent, aligned look, and are printed in ALL CAPS. */
function buildPreetiTemplate(){
  const fs = PREETI_FIELD_FONT_SIZE;
  return {
    id:'tpl_preeti_3m',
    name:'프리티텔레콤 · 선불 3개월 충전 신청서',
    carrier:'프리티텔레콤',
    imageDataUrl: PREETI_TEMPLATE_IMAGE_URL, // swapped for the embedded data: URL as soon as it loads (inlinePreetiImage)
    fields:[
      {id:'fld_p1', dataKey:'customer.planType',    x:53, y:7.9,  fontSize:fs, customText:''},
      {id:'fld_p2', dataKey:'customer.carrierType', x:28, y:3.9,  fontSize:fs, customText:''},
      {id:'fld_p3', dataKey:'customer.name',        x:27, y:14.3, fontSize:fs, customText:''},
      {id:'fld_p4', dataKey:'customer.dobShort',    x:73, y:14.3, fontSize:fs, customText:''},
      {id:'fld_p5', dataKey:'customer.idNumber',    x:78, y:17.3, fontSize:fs, customText:''},
      {id:'fld_p6', dataKey:'custom.text',          x:27, y:19.3, fontSize:fs, customText:PREETI_FIXED_ADDRESS},
      {id:'fld_p7', dataKey:'customer.nationality', x:66, y:19.3, fontSize:fs, customText:''},
      {id:'fld_p8', dataKey:'custom.text',          x:68, y:29.0, fontSize:fs, customText:PREETI_FIXED_PLAN},
      {id:'fld_p9', dataKey:'customer.branchOffice',x:10, y:96.2, fontSize:fs, customText:''},
      {id:'fld_p10',dataKey:'service.usimNumber',   x:27, y:29.2, fontSize:fs, customText:''},
      {id:'fld_p11',dataKey:'customer.name',        x:68, y:83.6, fontSize:fs, customText:''},
      {id:'fld_p12',dataKey:'customer.name',        x:68, y:91.0, fontSize:fs, customText:''},
      // the 5 REQUIRED (필수) consent checkboxes — auto-marked since the store already
      // walks the customer through these in person before printing; the 2 optional (선택)
      // consent items further down are left blank and still need an actual choice
      {id:'fld_chk1',dataKey:'custom.text', x:77.5, y:51.2, fontSize:11, customText:'✓'},
      {id:'fld_chk2',dataKey:'custom.text', x:77.5, y:54.2, fontSize:11, customText:'✓'},
      {id:'fld_chk3',dataKey:'custom.text', x:77.5, y:57.2, fontSize:11, customText:'✓'},
      {id:'fld_chk4',dataKey:'custom.text', x:77.5, y:60.7, fontSize:11, customText:'✓'},
      {id:'fld_chk5',dataKey:'custom.text', x:77.5, y:64.2, fontSize:11, customText:'✓'},
    ]
  };
}
/* Only create the built-in template if it doesn't exist yet — never overwrite it on reload,
   otherwise any manual edits made in the template editor would be lost every time the app loads. */
function ensurePreetiTemplate(db){
  if(!db.templates) db.templates = [];
  const exists = db.templates.some(tp=>tp.id==='tpl_preeti_3m');
  if(!exists) db.templates.push(buildPreetiTemplate());
  inlinePreetiImage(db);
}
/* Converts the built-in template's image from the file link to the same embedded data: URL
   format it has always been stored in, so what's saved (and synced to the other computers)
   is exactly as before. The link itself already displays and prints fine meanwhile. */
let preetiInlineInFlight = false;
function inlinePreetiImage(db){
  const tp = (db.templates||[]).find(x=>x.id==='tpl_preeti_3m');
  if(!tp || tp.imageDataUrl!==PREETI_TEMPLATE_IMAGE_URL || preetiInlineInFlight) return;
  preetiInlineInFlight = true;
  fetch(PREETI_TEMPLATE_IMAGE_URL).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.blob(); })
    .then(blob=> new Promise((res,rej)=>{ const fr = new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(blob); }))
    .then(dataUrl=>{
      const cur = (DB.templates||[]).find(x=>x.id==='tpl_preeti_3m');
      if(cur && cur.imageDataUrl===PREETI_TEMPLATE_IMAGE_URL){ cur.imageDataUrl = dataUrl; saveDB(DB); }
    })
    .catch(err=> console.warn('Could not load preeti-template.jpg (template still works via the file link):', err.message))
    .finally(()=>{ preetiInlineInFlight = false; });
}

/* ---------------- templates: list page ---------------- */
/* Information-change templates ("purpose"==='idChange') are the 2-page Passport → ARC form —
   kept out of every GENERAL template picker (new customer signup, quick print on a service
   card) so they never show up by accident there, which used to be exactly the confusing
   mix-up: uploading an Information-change form made it appear as a choice when adding a
   brand new customer, with no way to tell the two apart in that dropdown.
   Each Information-change template is ONE record holding BOTH pages (imageDataUrl/fields for
   page 1, imageDataUrl2/fields2 for page 2) uploaded together — originally this was two
   separate template records (purpose 'idChangePage1' / 'idChangePage2') paired up by matching
   carrier text, which was confusing and error-prone (e.g. uploading page 2 without carefully
   re-picking "page 2" in the dropdown just left it as a general template). migrateIdChangeTemplatePairs()
   below folds any old-style pair still on file into the new single-record shape. */
function isIdChangeTemplatePurpose(purpose){ return purpose==='idChange' || purpose==='idChangePage1' || purpose==='idChangePage2'; }
function getGeneralTemplates(){ return DB.templates.filter(tp=>!isIdChangeTemplatePurpose(tp.purpose)); }
function getIdChangeTemplates(){ return DB.templates.filter(tp=>isIdChangeTemplatePurpose(tp.purpose)); }
/* One-time, idempotent upgrade of old-style idChangePage1/idChangePage2 template pairs (two
   separate records, matched by carrier) into the new single-record shape (one 'idChange'
   template holding both pages). Safe to call on every load — once there are no more
   'idChangePage1'/'idChangePage2' records left, it's a no-op. */
function migrateIdChangeTemplatePairs(db){
  if(!db.templates) return;
  const page1s = db.templates.filter(t=>t.purpose==='idChangePage1');
  const page2s = db.templates.filter(t=>t.purpose==='idChangePage2');
  if(!page1s.length && !page2s.length) return;
  const merged = [];
  const usedPage2Ids = new Set();
  page1s.forEach(p1=>{
    const p2 = page2s.find(p=> !usedPage2Ids.has(p.id) && (p.carrier||'').trim()===(p1.carrier||'').trim());
    if(p2) usedPage2Ids.add(p2.id);
    merged.push({
      id: p1.id, name: p1.name, carrier: p1.carrier||'', purpose:'idChange',
      imageDataUrl: p1.imageDataUrl, fields: p1.fields||[],
      imageDataUrl2: p2 ? p2.imageDataUrl : '', fields2: p2 ? (p2.fields||[]) : [],
    });
  });
  // Any leftover page-2 records with no matching page-1 (shouldn't normally happen, but
  // don't silently drop real uploaded data) become their own incomplete record missing page 1.
  page2s.filter(p2=>!usedPage2Ids.has(p2.id)).forEach(p2=>{
    merged.push({
      id: p2.id, name: p2.name, carrier: p2.carrier||'', purpose:'idChange',
      imageDataUrl:'', fields:[], imageDataUrl2: p2.imageDataUrl, fields2: p2.fields||[],
    });
  });
  const mergedIds = new Set([...page1s.map(t=>t.id), ...page2s.map(t=>t.id)]);
  db.templates = db.templates.filter(t=>!mergedIds.has(t.id)).concat(merged);
}
/* Templates list page — split into two clearly separate sections so the two kinds of form
   never look like one undifferentiated pile: general carrier application forms (used for
   every new signup / recharge / plan change print) versus Information-change forms (the
   Passport → ARC 2-page form, one pair per carrier, used only via "Information change" →
   print and never offered as a signup template). */
function renderTemplates(){
  const grid = document.getElementById('tplGrid');
  // Force #tplGrid itself into a plain vertical block layout. It was originally built to
  // hold one flat row of cards (hence its own grid/flex CSS in style.css, which we can't
  // edit here), but now holds whole sections stacked top to bottom instead, so its own
  // layout mode needs to be a simple column, not a multi-column grid/row.
  grid.style.display = 'block';
  grid.style.gridTemplateColumns = 'none';
  const cardHtml = tp => {
    // Information-change templates now hold both pages on one record — show a small
    // page-count note instead of the old "Page 1"/"Page 2" labels (those only existed
    // because each page used to be its own separate template record). Some carriers'
    // forms are genuinely only 1 page, so a single-page template is normal, not an error.
    let purposeNote = '';
    if(isIdChangeTemplatePurpose(tp.purpose)){
      const pageCount = (tp.imageDataUrl?1:0) + (tp.imageDataUrl2?1:0);
      purposeNote = ` · ${pageCount} ${LANG==='zh'?'页':(pageCount===1?'page':'pages')}`;
    }
    const fieldCount = (tp.fields?.length||0) + (tp.fields2?.length||0);
    const chips = [tp.carrier||'—', `${fieldCount} ${LANG==='zh'?'个字段':'fields'}`, purposeNote.replace(/^ · /,'')].filter(Boolean);
    return `<div class="tpl-card" data-open-tpl="${tp.id}" data-carrier="${escapeHtml(String(tp.carrier||'—').toUpperCase())}">
      <div class="tpl-thumb" style="background-image:url('${tp.imageDataUrl}')"></div>
      <div class="tpl-card-body">
        <div class="tpl-card-name">${escapeHtml(tp.name)}</div>
        <div class="tpl-card-meta">${chips.map((c,i)=>`<span class="tpl-chip${i===0?' tpl-chip-c':''}">${escapeHtml(c)}</span>`).join('')}</div>
        <span class="tpl-edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg><span>${tplText('edit')}</span></span>
      </div>
    </div>`;
  };
  // #tplGrid itself may already carry a CSS grid/flex layout from style.css (we can't see
  // or edit that file here). Since this innerHTML now inserts several top-level sibling
  // blocks (title/desc/inner-grid, twice) instead of one flat list of cards, each of those
  // siblings would otherwise be treated as a single item of #tplGrid's own layout — e.g.
  // squeezed into one column if the parent is a multi-column grid. "grid-column:1/-1" makes
  // a block span every column when the parent is a grid; "width:100%" + "flex:1 1 100%"
  // covers the case where the parent is a flex row instead. display:block overrides either
  // parent treating these as inline/flex items. Together this is defensive against whichever
  // layout #tplGrid actually has.
  const spanAll = 'display:block;width:100%;grid-column:1/-1;flex:1 1 100%;';
  const gridStyle = `${spanAll}display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;`;
  const generalCards = getGeneralTemplates().map(cardHtml).join('');
  const idChangeCards = getIdChangeTemplates().map(cardHtml).join('');
  grid.innerHTML = `
    <div class="section-title" style="${spanAll}margin-bottom:4px;">${t('tpl.section.general')}</div>
    <div class="section-desc" style="${spanAll}margin-bottom:12px;">${t('tpl.section.generalDesc')}</div>
    <div style="${gridStyle}">
      ${generalCards}
      <div class="tpl-new-card" id="tplNewCardGeneral"><div style="font-size:28px;">＋</div><div>${t('tpl.upload')}</div></div>
    </div>
    <div class="form-hr" style="${spanAll}margin:24px 0;"></div>
    <div class="section-title" style="${spanAll}margin-bottom:4px;">${t('tpl.section.idChange')}</div>
    <div class="section-desc" style="${spanAll}margin-bottom:12px;">${t('tpl.section.idChangeDesc')}</div>
    <div style="${gridStyle}">
      ${idChangeCards}
      <div class="tpl-new-card" id="tplNewCardIdChange"><div style="font-size:28px;">＋</div><div>${t('tpl.upload')}</div></div>
    </div>
  `;
  document.getElementById('tplNewCardGeneral').addEventListener('click', ()=> openTemplateEditor(null));
  document.getElementById('tplNewCardIdChange').addEventListener('click', ()=> openTemplateEditor(null, 'idChange'));
  grid.querySelectorAll('[data-open-tpl]').forEach(el=> el.addEventListener('click', ()=> openTemplateEditor(getTemplate(el.getAttribute('data-open-tpl')))));
  renderTemplateToolbar(grid);
  applyTemplateFilter();
}
/* Search box + carrier chips above the template cards. The filter just shows/hides cards,
   so typing never rebuilds the page (and never loses the cursor). */
const tplFilter = {q:'', carrier:''};
const TPL_TX = {en:{search:'Search templates…',all:'All',edit:'Edit fields',count:'templates',none:'No template matches your search.'},
                zh:{search:'搜索模板…',all:'全部',edit:'编辑字段',count:'个模板',none:'没有符合条件的模板。'},
                ko:{search:'템플릿 검색…',all:'전체',edit:'필드 편집',count:'개 템플릿',none:'검색 결과가 없습니다.'}};
function tplText(k){ return (TPL_TX[LANG]||TPL_TX.en)[k]; }
function renderTemplateToolbar(grid){
  const carriers = [...new Set([...grid.querySelectorAll('.tpl-card')].map(c=>c.dataset.carrier).filter(Boolean))].sort();
  if(tplFilter.carrier && !carriers.includes(tplFilter.carrier)) tplFilter.carrier = '';
  let tb = document.getElementById('tplBar');
  if(!tb){ tb = document.createElement('div'); tb.id = 'tplBar'; tb.className = 'tpl-bar'; grid.parentNode.insertBefore(tb, grid); }
  tb.innerHTML = `<input type="search" id="tplSearch" class="tpl-search" autocomplete="off" placeholder="${escapeHtml(tplText('search'))}"><div class="tpl-chips" id="tplChips">${
    ['',...carriers].map(k=>`<button type="button" class="tpl-fchip${tplFilter.carrier===k?' on':''}" data-tpl-carrier="${escapeHtml(k)}">${escapeHtml(k||tplText('all'))}</button>`).join('')
  }</div><span class="tpl-count" id="tplCount"></span>`;
  const inp = tb.querySelector('#tplSearch'); inp.value = tplFilter.q;
  inp.addEventListener('input', ()=>{ tplFilter.q = inp.value; applyTemplateFilter(); });
  tb.querySelectorAll('[data-tpl-carrier]').forEach(b=> b.addEventListener('click', ()=>{
    tplFilter.carrier = b.dataset.tplCarrier;
    tb.querySelectorAll('[data-tpl-carrier]').forEach(x=> x.classList.toggle('on', x===b));
    applyTemplateFilter();
  }));
}
function applyTemplateFilter(){
  const grid = document.getElementById('tplGrid'); if(!grid) return;
  const q = tplFilter.q.toLowerCase(); let n = 0;
  grid.querySelectorAll('.tpl-card').forEach(c=>{
    const nm = (c.querySelector('.tpl-card-name')||{}).textContent||'', mt = c.dataset.carrier||'';
    const show = (!q || (nm+' '+mt).toLowerCase().includes(q)) && (!tplFilter.carrier || mt===tplFilter.carrier);
    c.style.display = show ? '' : 'none'; if(show) n++;
  });
  const cnt = document.getElementById('tplCount'); if(cnt) cnt.textContent = n+' '+tplText('count');
  let em = document.getElementById('tplEmpty');
  if(!n){ if(!em){ em = document.createElement('div'); em.id = 'tplEmpty'; em.className = 'tpl-empty'; grid.parentNode.insertBefore(em, grid.nextSibling); } em.textContent = tplText('none'); }
  else if(em) em.remove();
}
function getTemplate(id){ return DB.templates.find(t=>t.id===id); }

/* ---------------- template editor ---------------- */
let editingTemplateId = null;
let editorFields = [];       // working copy of fields while editing — page 1
let editorImageDataUrl = '';
let selectedFieldId = null;
let draggingFieldId = null;
// Page 2 — only used/visible when "Use for" = Information change. Kept as a second,
// parallel set of state (rather than an array of pages) since there are always exactly
// two pages for this form and it keeps every function below a direct mirror of the
// page-1 version instead of a more abstract, harder-to-follow loop.
let editorFields2 = [];
let editorImageDataUrl2 = '';
let selectedFieldId2 = null;
let draggingFieldId2 = null;

/* index.html only ships the single-page editor (upload zone + canvas + field list) since
   that's all templates used to need. Since that file isn't editable in this environment, the
   Page 2 editor is built once at runtime by cloning the page-1 editor's own DOM (so it always
   matches its styling exactly) and renaming every cloned id with a "_p2" suffix, then wiring
   fresh event listeners onto the clone. */
function ensureIdChangePage2Editor(){
  if(document.getElementById('tplPage2Section')) return;
  const origUZ = document.getElementById('tplUploadZone');
  const origEW = document.getElementById('tplEditorWrap');
  if(!origUZ || !origEW) return;

  const section = document.createElement('div');
  section.id = 'tplPage2Section';
  section.style.display = 'none';
  section.innerHTML = `<div class="form-hr" style="margin:20px 0 14px;"></div>
    <div id="tplPage2Label" style="font-weight:700;font-size:13px;margin-bottom:10px;"></div>`;

  const uz2 = origUZ.cloneNode(true);
  uz2.id = 'tplUploadZone_p2';
  uz2.classList.remove('drag');
  uz2.querySelectorAll('[id]').forEach(el=>{ el.id = el.id+'_p2'; });
  section.appendChild(uz2);

  const ew2 = origEW.cloneNode(true);
  ew2.id = 'tplEditorWrap_p2';
  ew2.style.display = 'none';
  ew2.querySelectorAll('[id]').forEach(el=>{ el.id = el.id+'_p2'; });
  const canvas2 = ew2.querySelector('#tplCanvas_p2');
  if(canvas2) canvas2.innerHTML = '';
  const list2 = ew2.querySelector('#tplFieldList_p2');
  if(list2) list2.innerHTML = '';
  section.appendChild(ew2);

  origEW.insertAdjacentElement('afterend', section);

  const input2 = uz2.querySelector('input[type="file"]') || (()=>{
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*'; i.style.display = 'none'; i.id = 'tplImageInput_p2';
    section.appendChild(i);
    return i;
  })();
  input2.addEventListener('change', e=>{ if(e.target.files[0]) loadTplImage2(e.target.files[0]); });
  uz2.addEventListener('click', ()=> input2.click());
  uz2.addEventListener('dragover', e=>{ e.preventDefault(); uz2.classList.add('drag'); });
  uz2.addEventListener('dragleave', ()=> uz2.classList.remove('drag'));
  uz2.addEventListener('drop', e=>{ e.preventDefault(); uz2.classList.remove('drag'); if(e.dataTransfer.files[0]) loadTplImage2(e.dataTransfer.files[0]); });

  const changeBtn2 = ew2.querySelector('#tplChangeImageBtn_p2');
  if(changeBtn2){
    changeBtn2.addEventListener('click', ()=>{
      editorImageDataUrl2 = ''; editorFields2 = [];
      uz2.style.display = '';
      ew2.style.display = 'none';
    });
  }
  if(canvas2){
    document.addEventListener('mousemove', e=>{
      if(!draggingFieldId2) return;
      const rect = canvas2.getBoundingClientRect();
      const f = editorFields2.find(f=>f.id===draggingFieldId2);
      if(!f) return;
      f.x = Math.min(100,Math.max(0, ((e.clientX-rect.left)/rect.width*100)));
      f.y = Math.min(100,Math.max(0, ((e.clientY-rect.top)/rect.height*100)));
      const chip = canvas2.querySelector(`[data-field-chip2="${draggingFieldId2}"]`);
      if(chip){ chip.style.left = f.x+'%'; chip.style.top = f.y+'%'; }
    });
  }
  document.addEventListener('mouseup', ()=>{ draggingFieldId2 = null; });
}

/* The "Use for" dropdown used to offer 3 choices (general / Information-change page 1 /
   Information-change page 2) baked into index.html. Since an Information-change template is
   now a single record holding both pages, it's simplified here to just 2 choices. */
function ensureTplPurposeOptions(){
  const sel = document.getElementById('tpl_purpose');
  if(!sel) return;
  // Rebuilding the two <option> labels every call keeps them correct after a language
  // switch (they carry no data-i18n attribute of their own, since they replace index.html's
  // original static 3-option list, so the normal data-i18n refresh loop never touches them).
  const current = sel.value;
  sel.innerHTML = `<option value="">${t('tpl.purpose.general')}</option><option value="idChange">${t('tpl.purpose.idChange')}</option>`;
  sel.value = current==='idChange' ? 'idChange' : '';
  if(sel.dataset.simplified==='1') return; // listener already attached — only re-done once
  sel.dataset.simplified = '1';
  sel.addEventListener('change', e=>{
    const sec = document.getElementById('tplPage2Section');
    if(sec) sec.style.display = e.target.value==='idChange' ? '' : 'none';
  });
}

function openTemplateEditor(tpl, defaultPurpose){
  ensureIdChangePage2Editor();
  ensureTplPurposeOptions();
  const label2 = document.getElementById('tplPage2Label');
  if(label2) label2.textContent = t('tpl.page2Label');

  editingTemplateId = tpl ? tpl.id : null;
  editorFields = tpl ? JSON.parse(JSON.stringify(tpl.fields||[])) : [];
  editorImageDataUrl = tpl ? (tpl.imageDataUrl||'') : '';
  selectedFieldId = null;
  editorFields2 = tpl ? JSON.parse(JSON.stringify(tpl.fields2||[])) : [];
  editorImageDataUrl2 = tpl ? (tpl.imageDataUrl2||'') : '';
  selectedFieldId2 = null;

  document.getElementById('templateEditorTitle').textContent = tpl ? t('tpl.editor.edit') : t('tpl.editor.new');
  document.getElementById('tpl_name').value = tpl?.name || '';
  document.getElementById('tpl_carrier').value = tpl?.carrier || '';
  // "+" from the Information-change section pre-selects it so staff don't have to
  // remember to switch "Use for" away from the general-form default every single time.
  const purpose = tpl?.purpose || defaultPurpose || '';
  document.getElementById('tpl_purpose').value = isIdChangeTemplatePurpose(purpose) ? 'idChange' : '';
  document.getElementById('tplDeleteBtn').style.display = tpl ? '' : 'none';

  if(editorImageDataUrl){
    document.getElementById('tplUploadZone').style.display = 'none';
    document.getElementById('tplEditorWrap').style.display = 'flex';
    renderTplCanvas();
  } else {
    document.getElementById('tplUploadZone').style.display = '';
    document.getElementById('tplEditorWrap').style.display = 'none';
  }

  const page2Section = document.getElementById('tplPage2Section');
  const isIdChange = isIdChangeTemplatePurpose(purpose);
  if(page2Section) page2Section.style.display = isIdChange ? '' : 'none';
  if(editorImageDataUrl2){
    document.getElementById('tplUploadZone_p2').style.display = 'none';
    document.getElementById('tplEditorWrap_p2').style.display = 'flex';
    renderTplCanvas2();
  } else {
    document.getElementById('tplUploadZone_p2').style.display = '';
    document.getElementById('tplEditorWrap_p2').style.display = 'none';
  }

  document.getElementById('templateEditorOverlay').classList.add('show');
}
function renderTplCanvas(){
  const canvas = document.getElementById('tplCanvas');
  canvas.style.backgroundImage = `url('${editorImageDataUrl}')`;
  canvas.innerHTML = `<img src="${editorImageDataUrl}" id="tplCanvasImg">` + editorFields.map(f=>`
    <div class="tpl-field-chip ${f.id===selectedFieldId?'selected':''}" data-field-chip="${f.id}" style="left:${f.x}%;top:${f.y}%;font-size:${(f.fontSize||11)}px;">${mergeFieldLabel(f.dataKey)}</div>
  `).join('');
  renderTplFieldList();
  // click to add new field
  canvas.onclick = (e)=>{
    if(e.target.closest('[data-field-chip]')) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX-rect.left)/rect.width*100).toFixed(2);
    const y = ((e.clientY-rect.top)/rect.height*100).toFixed(2);
    const f = {id:uid('fld'), dataKey:'customer.name', x:Number(x), y:Number(y), fontSize:12, customText:''};
    editorFields.push(f);
    selectedFieldId = f.id;
    renderTplCanvas();
  };
  canvas.querySelectorAll('[data-field-chip]').forEach(chip=>{
    chip.addEventListener('mousedown', e=>{
      e.stopPropagation();
      draggingFieldId = chip.getAttribute('data-field-chip');
      selectedFieldId = draggingFieldId;
      renderTplCanvas();
    });
  });
}
document.getElementById('tplCanvas')?.addEventListener('mousemove', e=>{
  if(!draggingFieldId) return;
  const canvas = document.getElementById('tplCanvas');
  const rect = canvas.getBoundingClientRect();
  const f = editorFields.find(f=>f.id===draggingFieldId);
  if(!f) return;
  f.x = Math.min(100,Math.max(0, ((e.clientX-rect.left)/rect.width*100)));
  f.y = Math.min(100,Math.max(0, ((e.clientY-rect.top)/rect.height*100)));
  const chip = canvas.querySelector(`[data-field-chip="${draggingFieldId}"]`);
  if(chip){ chip.style.left = f.x+'%'; chip.style.top = f.y+'%'; }
});
document.addEventListener('mouseup', ()=>{ draggingFieldId = null; });

function renderTplFieldList(){
  const list = document.getElementById('tplFieldList');
  if(!editorFields.length){ list.innerHTML = `<div class="tpl-hint">${t('tpl.noFields')}</div>`; return; }
  list.innerHTML = editorFields.map(f=>`
    <div class="tpl-field-list-item ${f.id===selectedFieldId?'selected':''}" data-select-field="${f.id}">
      <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
        <select data-set-key="${f.id}" style="width:100%;padding:5px 6px;border-radius:6px;border:1px solid var(--border);font-size:12px;">
          ${MERGE_FIELDS.map(([k,l])=>`<option value="${k}" ${f.dataKey===k?'selected':''}>${l[LANG]||l.zh}</option>`).join('')}
        </select>
        ${f.dataKey==='custom.text' ? `<input data-set-text="${f.id}" placeholder="${LANG==='zh'?'输入文字':'Enter text'}" value="${escapeHtml(f.customText||'')}" style="width:100%;padding:5px 6px;border-radius:6px;border:1px solid var(--border);font-size:12px;">` : ''}
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;color:var(--text-soft);">${LANG==='zh'?'字号':'Size'}</span>
          <input type="number" data-set-size="${f.id}" value="${f.fontSize||12}" min="6" max="40" style="width:56px;padding:4px 6px;border-radius:6px;border:1px solid var(--border);font-size:12px;">
          <button class="btn btn-sm btn-danger" data-del-field="${f.id}" style="margin-left:auto;">✕</button>
        </div>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-select-field]').forEach(el=> el.addEventListener('click', (e)=>{ if(e.target.closest('select,input,button')) return; selectedFieldId = el.getAttribute('data-select-field'); renderTplCanvas(); }));
  list.querySelectorAll('[data-set-key]').forEach(el=> el.addEventListener('change', e=>{ const f=editorFields.find(f=>f.id===el.getAttribute('data-set-key')); f.dataKey = el.value; renderTplCanvas(); }));
  list.querySelectorAll('[data-set-text]').forEach(el=> el.addEventListener('input', e=>{ const f=editorFields.find(f=>f.id===el.getAttribute('data-set-text')); f.customText = el.value; }));
  list.querySelectorAll('[data-set-size]').forEach(el=> el.addEventListener('input', e=>{ const f=editorFields.find(f=>f.id===el.getAttribute('data-set-size')); f.fontSize = Number(el.value)||12; renderTplCanvas(); }));
  list.querySelectorAll('[data-del-field]').forEach(el=> el.addEventListener('click', e=>{ editorFields = editorFields.filter(f=>f.id!==el.getAttribute('data-del-field')); if(selectedFieldId===el.getAttribute('data-del-field')) selectedFieldId=null; renderTplCanvas(); }));
}

/* Page 2 mirrors of renderTplCanvas/renderTplFieldList/loadTplImage above — same behavior,
   operating on the editorFields2/editorImageDataUrl2/selectedFieldId2 state and the cloned
   "_p2" DOM elements built by ensureIdChangePage2Editor(). */
function renderTplCanvas2(){
  const canvas = document.getElementById('tplCanvas_p2');
  if(!canvas) return;
  canvas.style.backgroundImage = `url('${editorImageDataUrl2}')`;
  canvas.innerHTML = `<img src="${editorImageDataUrl2}" id="tplCanvasImg_p2">` + editorFields2.map(f=>`
    <div class="tpl-field-chip ${f.id===selectedFieldId2?'selected':''}" data-field-chip2="${f.id}" style="left:${f.x}%;top:${f.y}%;font-size:${(f.fontSize||11)}px;">${mergeFieldLabel(f.dataKey)}</div>
  `).join('');
  renderTplFieldList2();
  canvas.onclick = (e)=>{
    if(e.target.closest('[data-field-chip2]')) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX-rect.left)/rect.width*100).toFixed(2);
    const y = ((e.clientY-rect.top)/rect.height*100).toFixed(2);
    const f = {id:uid('fld'), dataKey:'customer.name', x:Number(x), y:Number(y), fontSize:12, customText:''};
    editorFields2.push(f);
    selectedFieldId2 = f.id;
    renderTplCanvas2();
  };
  canvas.querySelectorAll('[data-field-chip2]').forEach(chip=>{
    chip.addEventListener('mousedown', e=>{
      e.stopPropagation();
      draggingFieldId2 = chip.getAttribute('data-field-chip2');
      selectedFieldId2 = draggingFieldId2;
      renderTplCanvas2();
    });
  });
}
function renderTplFieldList2(){
  const list = document.getElementById('tplFieldList_p2');
  if(!list) return;
  if(!editorFields2.length){ list.innerHTML = `<div class="tpl-hint">${t('tpl.noFields')}</div>`; return; }
  list.innerHTML = editorFields2.map(f=>`
    <div class="tpl-field-list-item ${f.id===selectedFieldId2?'selected':''}" data-select-field="${f.id}">
      <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
        <select data-set-key="${f.id}" style="width:100%;padding:5px 6px;border-radius:6px;border:1px solid var(--border);font-size:12px;">
          ${MERGE_FIELDS.map(([k,l])=>`<option value="${k}" ${f.dataKey===k?'selected':''}>${l[LANG]||l.zh}</option>`).join('')}
        </select>
        ${f.dataKey==='custom.text' ? `<input data-set-text="${f.id}" placeholder="${LANG==='zh'?'输入文字':'Enter text'}" value="${escapeHtml(f.customText||'')}" style="width:100%;padding:5px 6px;border-radius:6px;border:1px solid var(--border);font-size:12px;">` : ''}
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;color:var(--text-soft);">${LANG==='zh'?'字号':'Size'}</span>
          <input type="number" data-set-size="${f.id}" value="${f.fontSize||12}" min="6" max="40" style="width:56px;padding:4px 6px;border-radius:6px;border:1px solid var(--border);font-size:12px;">
          <button class="btn btn-sm btn-danger" data-del-field="${f.id}" style="margin-left:auto;">✕</button>
        </div>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-select-field]').forEach(el=> el.addEventListener('click', (e)=>{ if(e.target.closest('select,input,button')) return; selectedFieldId2 = el.getAttribute('data-select-field'); renderTplCanvas2(); }));
  list.querySelectorAll('[data-set-key]').forEach(el=> el.addEventListener('change', e=>{ const f=editorFields2.find(f=>f.id===el.getAttribute('data-set-key')); f.dataKey = el.value; renderTplCanvas2(); }));
  list.querySelectorAll('[data-set-text]').forEach(el=> el.addEventListener('input', e=>{ const f=editorFields2.find(f=>f.id===el.getAttribute('data-set-text')); f.customText = el.value; }));
  list.querySelectorAll('[data-set-size]').forEach(el=> el.addEventListener('input', e=>{ const f=editorFields2.find(f=>f.id===el.getAttribute('data-set-size')); f.fontSize = Number(el.value)||12; renderTplCanvas2(); }));
  list.querySelectorAll('[data-del-field]').forEach(el=> el.addEventListener('click', e=>{ editorFields2 = editorFields2.filter(f=>f.id!==el.getAttribute('data-del-field')); if(selectedFieldId2===el.getAttribute('data-del-field')) selectedFieldId2=null; renderTplCanvas2(); }));
}
function loadTplImage2(file){
  const reader = new FileReader();
  reader.onload = e=>{
    editorImageDataUrl2 = e.target.result;
    document.getElementById('tplUploadZone_p2').style.display = 'none';
    document.getElementById('tplEditorWrap_p2').style.display = 'flex';
    renderTplCanvas2();
  };
  reader.readAsDataURL(file);
}

document.getElementById('tplImageInput').addEventListener('change', e=>{ if(e.target.files[0]) loadTplImage(e.target.files[0]); });
document.getElementById('tplUploadZone').addEventListener('click', ()=> document.getElementById('tplImageInput').click());
document.getElementById('tplUploadZone').addEventListener('dragover', e=>{ e.preventDefault(); document.getElementById('tplUploadZone').classList.add('drag'); });
document.getElementById('tplUploadZone').addEventListener('dragleave', ()=> document.getElementById('tplUploadZone').classList.remove('drag'));
document.getElementById('tplUploadZone').addEventListener('drop', e=>{ e.preventDefault(); document.getElementById('tplUploadZone').classList.remove('drag'); if(e.dataTransfer.files[0]) loadTplImage(e.dataTransfer.files[0]); });
document.getElementById('tplChangeImageBtn').addEventListener('click', ()=>{
  editorImageDataUrl = ''; editorFields = [];
  document.getElementById('tplUploadZone').style.display = '';
  document.getElementById('tplEditorWrap').style.display = 'none';
});
function loadTplImage(file){
  const reader = new FileReader();
  reader.onload = e=>{
    editorImageDataUrl = e.target.result;
    document.getElementById('tplUploadZone').style.display = 'none';
    document.getElementById('tplEditorWrap').style.display = 'flex';
    renderTplCanvas();
  };
  reader.readAsDataURL(file);
}
document.getElementById('tplSaveBtn').addEventListener('click', ()=>{
  const name = document.getElementById('tpl_name').value.trim();
  if(!name){ toast(LANG==='zh'?'请输入模板名称':'Please enter a template name'); return; }
  if(!editorImageDataUrl){ toast(LANG==='zh'?'请先上传表格图片':'Please upload a form image first'); return; }
  const purpose = document.getElementById('tpl_purpose').value;
  const isIdChange = purpose==='idChange';
  // Page 2 is optional — some carriers' Information-change form really is only 1 page.
  // doPrintIdChangePair / getIdChangeFormPairs below only print whichever pages exist.
  const data = {
    name, carrier:document.getElementById('tpl_carrier').value.trim(), purpose,
    imageDataUrl:editorImageDataUrl, fields:editorFields,
    imageDataUrl2: isIdChange ? editorImageDataUrl2 : '',
    fields2: isIdChange ? editorFields2 : [],
  };
  if(editingTemplateId){
    Object.assign(getTemplate(editingTemplateId), data);
  } else {
    data.id = uid('tpl');
    DB.templates.push(data);
  }
  saveDB(DB);
  closeAllModals();
  toast(t('toast.customerSaved'));
  renderTemplates();
});
document.getElementById('tplDeleteBtn').addEventListener('click', async ()=>{
  if(!editingTemplateId) return;
  if(!confirm(t('confirm.delete'))) return;
  const deletedId = editingTemplateId;
  DB.templates = DB.templates.filter(t=>t.id!==deletedId);
  saveDB(DB);
  // /api/sync is upsert-only by design (never deletes, to protect against an incomplete
  // sync payload wiping data) — so a deleted template needs this explicit call too, same
  // as deleting a customer, or it would just reappear on the next pull from any computer
  if(isSyncEnabled()){
    const base = getServerUrl();
    try{
      const res = await fetch(base+'/api/templates/'+deletedId, {method:'DELETE', headers: authHeaders()});
      if(!res.ok && res.status!==404) throw new Error('HTTP '+res.status);
      setOfflineBanner(false);
    }catch(err){
      console.warn('Could not delete template on the server — it may reappear after the next pull until this succeeds:', err.message);
      setOfflineBanner(true, err.message);
    }
  }
  closeAllModals();
  toast(t('toast.deleted'));
  renderTemplates();
});

/* ---------------- print preview & output ---------------- */
let previewCustomerId = null, previewServiceId = null;
function openPrintPreview(customerId, serviceId, preferredTemplateId){
  // Same separation as the signup template picker — this is for general per-service prints
  // (quick print, save & print on signup), never the Information-change pair.
  const generalTemplates = getGeneralTemplates();
  if(!generalTemplates.length){
    toast(LANG==='zh'?'请先在「打印模板」页面上传运营商表格':'Please upload a carrier form in Print Templates first');
    goTo('templates');
    return;
  }
  previewCustomerId = customerId; previewServiceId = serviceId;
  const sel = document.getElementById('pp_template');
  sel.innerHTML = generalTemplates.map(tp=>`<option value="${tp.id}">${escapeHtml(tp.name)}</option>`).join('');
  sel.value = preferredTemplateId && getTemplate(preferredTemplateId) && !isIdChangeTemplatePurpose(getTemplate(preferredTemplateId).purpose)
    ? preferredTemplateId : generalTemplates[0].id;
  document.getElementById('pp_showbg').checked = true;
  renderPrintPreviewArea();
  document.getElementById('printPreviewOverlay').classList.add('show');
}
document.getElementById('pp_template').addEventListener('change', renderPrintPreviewArea);
document.getElementById('pp_showbg').addEventListener('change', renderPrintPreviewArea);
function buildPrintPageHtml(tpl, customer, service, showBg){
  const fieldsHtml = tpl.fields.map(f=>{
    const val = resolveMergeValue(f.dataKey, customer, service, f.customText);
    // printed application forms are filled in all-caps by store convention
    return `<div class="print-field" style="left:${f.x}%;top:${f.y}%;font-size:${f.fontSize||12}px;">${escapeHtml(String(val).toUpperCase())}</div>`;
  }).join('');
  const bgStyle = showBg ? `background-image:url('${tpl.imageDataUrl}');` : '';
  return `<div class="print-page ${showBg?'showbg':''}" style="${bgStyle}">${fieldsHtml}</div>`;
}
function renderPrintPreviewArea(){
  const tpl = getTemplate(document.getElementById('pp_template').value);
  if(!tpl) return;
  const customer = getCustomer(previewCustomerId);
  const service = getService(previewServiceId) || {};
  const showBg = document.getElementById('pp_showbg').checked;
  document.getElementById('printPreviewArea').innerHTML = buildPrintPageHtml(tpl, customer, service, showBg);
}
document.getElementById('pp_printBtn').addEventListener('click', ()=>{
  const tpl = getTemplate(document.getElementById('pp_template').value);
  if(!tpl) return;
  const customer = getCustomer(previewCustomerId);
  const service = getService(previewServiceId) || {};
  // printing always includes background image so it lines up with a blank page;
  // untick "include background" in the checkbox above if feeding pre-printed carrier paper.
  const showBg = document.getElementById('pp_showbg').checked;
  document.getElementById('printOverlay').innerHTML = buildPrintPageHtml(tpl, customer, service, showBg);
  setTimeout(()=> window.print(), 80);
});

/* quick print trigger from an existing service card (customer detail / orders) */
function quickPrintService(customerId, serviceId){
  const svc = getService(serviceId);
  if(!svc) return;
  const generalTemplates = getGeneralTemplates();
  if(!generalTemplates.length){
    toast(LANG==='zh'?'请先在「打印模板」页面上传运营商表格':'Please upload a carrier form in Print Templates first');
    goTo('templates');
    return;
  }
  const carrierMatch = generalTemplates.find(tp=> tp.carrier && svc.carrier && tp.carrier.trim()===svc.carrier.trim());
  openPrintPreview(customerId, serviceId, carrierMatch ? carrierMatch.id : generalTemplates[0].id);
}
/* Prints the ID change (Passport -> Resident Card) form as one continuous 2-page job —
   both pages use the same real, physical multi-page document, so they need to come out of
   the printer together as a single job, not as two separate individually-triggered prints.
   Different carriers have their own separate 2-page form, which is why each Information-
   change template still carries its own "carrier" field — but as of the single-record
   redesign, both pages now live on that ONE template, so there's no more cross-record
   pairing-by-carrier-text to get out of sync. */
let idChangePrintCustomerId = null;
/* Carrier forms aren't all 2 pages — some are genuinely just 1 page — so a template only
   needs page 1 to be printable here; page2 is included only when it was actually uploaded. */
function getIdChangeFormPairs(){
  return getIdChangeTemplates()
    .filter(tp=> tp.imageDataUrl) // page 1 is the only hard requirement
    .map(tp=> ({
      carrier: tp.carrier||'',
      page1: {imageDataUrl: tp.imageDataUrl, fields: tp.fields||[]},
      page2: tp.imageDataUrl2 ? {imageDataUrl: tp.imageDataUrl2, fields: tp.fields2||[]} : null,
    }));
}
function printIdChangeForm(customerId){
  const pairs = getIdChangeFormPairs();
  if(!pairs.length){
    toast(LANG==='zh'?'请先在「打印模板」页面上传信息变更申请表，并填写对应通信社':'Please upload the Information-change form in Print Templates first, with the matching carrier set');
    goTo('templates');
    return;
  }
  if(pairs.length===1){ doPrintIdChangePair(customerId, pairs[0]); return; }
  // More than one carrier's form is on file — try an exact match against the customer's
  // current service first, since that's almost always the right one without having to ask.
  const svc = activeSubscriptionFor(customerId);
  const autoMatch = svc && pairs.find(p=> p.carrier && svc.carrier && p.carrier.trim()===svc.carrier.trim());
  if(autoMatch){ doPrintIdChangePair(customerId, autoMatch); return; }
  // No confident match — let staff pick rather than silently guessing wrong and printing
  // the wrong carrier's form.
  idChangePrintCustomerId = customerId;
  const sel = document.getElementById('idcp_carrier');
  sel.innerHTML = pairs.map((p,i)=>`<option value="${i}">${escapeHtml(p.carrier || (LANG==='zh'?'（未填写通信社）':'(no carrier set)'))}</option>`).join('');
  document.getElementById('idChangePrintPickerOverlay').classList.add('show');
}
/* Both pages go out as a single print job — the OfficeJet Pro 9010 has automatic duplex, so
   enabling "Two-sided" / "Print on both sides" in the print dialog puts Page 1 and Page 2 on
   the front and back of one sheet automatically, with no manual flipping needed. A template
   with only page 1 on file (some carriers' forms really are just 1 page) simply prints that
   single page — there's no page 2 to include. */
function doPrintIdChangePair(customerId, pair){
  const customer = getCustomer(customerId);
  const service = activeSubscriptionFor(customerId) || {};
  const html = buildPrintPageHtml(pair.page1, customer, service, true)
    + (pair.page2 ? buildPrintPageHtml(pair.page2, customer, service, true) : '');
  document.getElementById('printOverlay').innerHTML = html;
  setTimeout(()=> window.print(), 80);
}
document.getElementById('idChangePrintPickerClose').addEventListener('click', closeAllModals);
document.getElementById('idChangePrintPickerCancel').addEventListener('click', closeAllModals);
document.getElementById('idChangePrintPickerPrint').addEventListener('click', ()=>{
  const pairs = getIdChangeFormPairs();
  const pair = pairs[Number(document.getElementById('idcp_carrier').value)];
  closeAllModals();
  if(pair) doPrintIdChangePair(idChangePrintCustomerId, pair);
});

/* ---------------- modal plumbing ---------------- */
function closeAllModals(){ document.querySelectorAll('.overlay').forEach(o=>o.classList.remove('show')); if(window.refreshCustomerForms) refreshCustomerForms(); }
document.querySelectorAll('[data-close]').forEach(b=> b.addEventListener('click', closeAllModals));
document.querySelectorAll('.overlay').forEach(o=> o.addEventListener('click', e=>{ if(e.target===o) closeAllModals(); }));

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove('show'), 2200);
}

/* ---------------- event bindings ---------------- */
document.getElementById('saveCustomerBtn').addEventListener('click', saveCustomerFromForm);
document.getElementById('savePrintCustomerBtn').addEventListener('click', saveCustomerAndPrint);
document.getElementById('detailEditBtn').addEventListener('click', ()=>{ const c=getCustomer(detailCustomerId); closeAllModals(); openCustomerModal(c); });
document.getElementById('detailAddServiceBtn').addEventListener('click', ()=>{ const id=detailCustomerId; closeAllModals(); openOrderModal(null, id); });
document.getElementById('detailDeleteBtn').addEventListener('click', ()=> deleteCustomerById(detailCustomerId));
// Edit / Print buttons on the profile's plan cards and history entries
document.getElementById('detailBody').addEventListener('click', e=>{
  const ed = e.target.closest('[data-edit-order]');
  if(ed){ e.preventDefault(); e.stopPropagation(); const svc = getService(ed.dataset.editOrder); if(svc){ closeAllModals(); openOrderModal(svc); } }
  // (Print buttons are wired in openCustomerDetail)
});
document.getElementById('detailMoreBtn').addEventListener('click', ()=>{
  const d = document.getElementById('detailDeleteBtn');
  const show = d.style.display==='none';
  d.style.display = show ? '' : 'none';
  document.getElementById('detailMoreBtn').textContent = show ? (LANG==='zh'?'收起':'Less') : (LANG==='zh'?'⋯ 更多':'⋯ More');
});
document.getElementById('deleteCustomerBtn').addEventListener('click', ()=> deleteCustomerById(editingCustomerId));
document.getElementById('saveOrderBtn').addEventListener('click', saveOrderFromForm);
document.getElementById('confirmImportBtn').addEventListener('click', confirmImport);
document.getElementById('menuBtn').addEventListener('click', ()=> document.getElementById('sidebar').classList.toggle('open'));

document.getElementById('custSearch').addEventListener('input', renderCustomers);
document.getElementById('custNationalityFilter').addEventListener('change', renderCustomers);
document.getElementById('custSortBy').addEventListener('change', renderCustomers);
document.getElementById('custDurationFilter').addEventListener('change', renderCustomers);
document.getElementById('custRecentFilter').addEventListener('change', renderCustomers);
document.getElementById('btnExportCustomers').addEventListener('click', exportAll);
document.getElementById('exportAllBtn').addEventListener('click', exportAll);
document.getElementById('syncServerUrl').addEventListener('change', e=> setServerUrl(e.target.value.trim()));
document.getElementById('syncApiKey').addEventListener('change', e=> setApiKey(e.target.value.trim()));
document.getElementById('syncEnabledCheckbox').addEventListener('change', e=>{
  const url = document.getElementById('syncServerUrl').value.trim();
  if(e.target.checked && !url){
    toast(LANG==='zh'?'请先输入服务器地址':'Please enter a server address first');
    e.target.checked = false;
    return;
  }
  setServerUrl(url);
  setApiKey(document.getElementById('syncApiKey').value.trim());
  setSyncEnabled(e.target.checked);
  updateSyncStatusUI();
  if(!e.target.checked) setOfflineBanner(false); // don't leave a stale banner up after turning sync off
  if(e.target.checked) toast(LANG==='zh'?'已启用同步':'Sync enabled');
});
document.getElementById('btnTestSync').addEventListener('click', async ()=>{
  const url = document.getElementById('syncServerUrl').value.trim();
  const btn = document.getElementById('btnTestSync');
  btn.disabled = true;
  const result = await testServerConnection(url);
  btn.disabled = false;
  toast(result.ok ? (LANG==='zh'?'连接成功':'Connected successfully') : (LANG==='zh'?'连接失败：':'Connection failed: ')+(result.error||''));
});
document.getElementById('btnPushSync').addEventListener('click', async ()=>{
  const url = document.getElementById('syncServerUrl').value.trim();
  if(!url){ toast(LANG==='zh'?'请先输入服务器地址':'Please enter a server address first'); return; }
  setServerUrl(url);
  setApiKey(document.getElementById('syncApiKey').value.trim());
  const btn = document.getElementById('btnPushSync');
  btn.disabled = true;
  // the manual button is the "send everything" recovery tool — always a full push
  const result = await pushToServer({full:true});
  btn.disabled = false;
  if(!result.ok){
    toast((LANG==='zh'?'推送失败：':'Push failed: ')+(result.error||''));
    return;
  }
  const failedCount = (result.failedCustomers?.length||0) + (result.failedServices?.length||0);
  if(failedCount > 0){
    toast(LANG==='zh'
      ? `已推送大部分数据，但有 ${failedCount} 条记录失败 — 详见浏览器控制台（按 F12 → Console）`
      : `Most data was pushed, but ${failedCount} record(s) failed — check the browser console (F12 → Console) for details`);
  } else {
    toast(LANG==='zh'?`已推送 ${DB.customers.length} 位客户、${DB.services.length} 条业务记录`:`Pushed ${DB.customers.length} customers, ${DB.services.length} services`);
  }
});
/* One-time cleanup tool: clears the payment method field for every service activated in a
   given month, so staff can go back and fill it in accurately rather than leaving it stuck
   on whatever default it was saved with when the actual method wasn't known yet at signup
   time. Requires typing the exact record count to confirm, since this touches many records
   at once and there's no per-record undo for a bulk change like this. */
document.getElementById('btnBulkClearPayment').addEventListener('click', async ()=>{
  const monthVal = document.getElementById('bulkClearPaymentMonth').value; // "YYYY-MM"
  if(!monthVal){ toast(LANG==='zh'?'请先选择月份':'Please select a month first'); return; }
  // "Customers from August" can genuinely mean two different things — activated in August,
  // or added to the system in August — and those aren't always the same set of records.
  // Letting the person choose which one, rather than silently picking one, avoids a repeat
  // of the exact confusion that came up when this only matched by activation date.
  const dateField = document.getElementById('bulkClearPaymentDateField').value; // 'activationDate' | 'createdAt'
  const affected = dateField==='activationDate'
    ? DB.services.filter(s=> s.activationDate && s.activationDate.slice(0,7)===monthVal && s.paymentMethod)
    : DB.services.filter(s=> s.paymentMethod && getCustomer(s.customerId)?.createdAt && String(getCustomer(s.customerId).createdAt).slice(0,7)===monthVal);
  if(!affected.length){
    toast(LANG==='zh'?'该月份没有已填写付款方式的记录':'No records with a payment method set for that month');
    return;
  }
  const monthLabel = new Date(monthVal+'-01').toLocaleDateString(LANG==='zh'?'zh-CN':'en-US', {year:'numeric', month:'long'});
  const names = affected.map(s=> getCustomer(s.customerId)?.name || '?');
  const namesPreview = names.length<=15 ? names.join(', ') : names.slice(0,15).join(', ')+(LANG==='zh'?` 等共${names.length}位`:` and ${names.length-15} more`);
  const confirmMsg = LANG==='zh'
    ? `将清空 ${monthLabel} 共 ${affected.length} 条记录的付款方式，此操作不可撤销。\n\n受影响客户：${namesPreview}\n\n请输入 ${affected.length} 以确认：`
    : `This will clear the payment method on ${affected.length} record(s) from ${monthLabel}. This cannot be undone.\n\nAffected customers: ${namesPreview}\n\nType ${affected.length} to confirm:`;
  const typed = prompt(confirmMsg);
  if(typed === null) return; // cancelled
  if(typed.trim() !== String(affected.length)){
    toast(LANG==='zh'?'输入的数字不匹配，已取消操作':'Number didn\'t match — cancelled');
    return;
  }
  affected.forEach(s=>{ s.paymentMethod = ''; });
  saveDB(DB);
  renderPage(currentPage);
  // Explicitly pushes and WAITS for the server to actually confirm it, rather than relying
  // on the normal 400ms debounce — a bulk change touching many records is exactly the kind
  // of thing someone might refresh right after to check, and the debounce alone was too
  // easy to beat with a fast refresh, silently discarding the change entirely since the
  // page would reload and pull the server's still-old copy before the push ever went out.
  if(isSyncEnabled()){
    toast(LANG==='zh'?'正在保存到服务器…请勿刷新页面':'Saving to server… please don\'t refresh yet');
    clearTimeout(syncTimer); // the debounced push saveDB() just scheduled is redundant now
    const result = await pushToServer();
    toast(result.ok
      ? (LANG==='zh'?`已清空并保存 ${affected.length} 条记录的付款方式`:`Cleared and saved payment method on ${affected.length} record(s)`)
      : (LANG==='zh'?'已在本机清空，但保存到服务器失败——请检查网络后重试，暂时不要刷新页面':'Cleared locally, but saving to the server failed — check your connection and try again; don\'t refresh yet'));
  } else {
    toast(LANG==='zh'?`已清空 ${affected.length} 条记录的付款方式`:`Cleared payment method on ${affected.length} record(s)`);
  }
});
document.getElementById('btnPullSync').addEventListener('click', async ()=>{
  const url = document.getElementById('syncServerUrl').value.trim();
  if(!url){ toast(LANG==='zh'?'请先输入服务器地址':'Please enter a server address first'); return; }
  setServerUrl(url);
  setApiKey(document.getElementById('syncApiKey').value.trim());
  if(!confirm(LANG==='zh'?'这会用服务器上的数据覆盖本机当前显示的数据（本机的本地存储也会更新）。是否继续？':'This will replace what you see on this computer with the server\'s data (this computer\'s local copy will be updated too). Continue?')) return;
  const btn = document.getElementById('btnPullSync');
  btn.disabled = true;
  const result = await pullFromServer();
  btn.disabled = false;
  if(result.ok){
    toast(LANG==='zh'?'已从服务器拉取最新数据':'Pulled the latest data from the server');
    renderPage(currentPage);
    renderNav();
  } else {
    toast((LANG==='zh'?'拉取失败：':'Pull failed: ')+(result.error||''));
  }
});
document.getElementById('btnFormatData').addEventListener('click', async ()=>{
  if(!DB.customers.length && !DB.services.length){
    toast(LANG==='zh' ? '目前没有数据可清空' : 'There\'s no data to clear right now');
    return;
  }
  const syncOn = isSyncEnabled();
  const wipeMsg = LANG==='zh'
    ? `即将清空全部 ${DB.customers.length} 位客户及 ${DB.services.length} 条业务记录${syncOn?'，包括服务器上其他电脑共享的数据':''}。系统会先自动导出一份 Excel 备份，此操作无法撤销。是否继续？`
    : `This will permanently clear all ${DB.customers.length} customers and ${DB.services.length} service records${syncOn?', including the shared data on the server that other computers use':''}. A backup Excel file will be exported automatically first. This cannot be undone. Continue?`;
  if(!confirm(wipeMsg)) return;
  // always back up first, no optional prompt — if the export itself fails, stop entirely
  // rather than risk wiping data with no copy of it anywhere
  try{
    exportAll();
  }catch(err){
    toast(LANG==='zh' ? '备份导出失败，为安全起见已取消清空，数据未被清空' : 'Backup export failed — clearing was cancelled for safety, your data was not touched');
    return;
  }
  // clear the shared server database next — if this fails (server unreachable, wrong key),
  // stop here rather than clearing locally and having the old data silently reappear on
  // the next sync
  if(syncOn){
    const base = getServerUrl();
    try{
      const res = await fetch(base+'/api/wipe', {method:'POST', headers: authHeaders()});
      if(!res.ok) throw new Error('HTTP '+res.status);
    }catch(err){
      toast(LANG==='zh' ? '无法清空服务器数据，已取消（本机数据也未清空，备份已保存）：'+err.message : 'Could not clear the server — cancelled (local data was not touched either, but your backup was saved): '+err.message);
      return;
    }
  }
  DB.customers = [];
  DB.services = [];
  DB.reminderState = {};
  if(syncOn) setSyncBaselineFrom([], []); // the server is empty now too
  saveDB(DB);
  toast(syncOn
    ? (LANG==='zh' ? '已备份，本机与服务器数据均已清空，可以导入新的文件了' : 'Backed up, then cleared on this computer AND the server — ready to import a new file')
    : (LANG==='zh' ? '已备份并清空数据，可以导入新的文件了' : 'Backed up and cleared — ready to import a new file'));
  renderPage(currentPage);
  renderNav();
});
document.getElementById('btnExportReport').addEventListener('click', exportReportForMonth);
document.getElementById('planCheckIncludeHistory').addEventListener('change', renderPlanCheck);
document.getElementById('btnPlanCheckExport').addEventListener('click', ()=>{
  const rows = (lastPlanCheck||[]).map(r=>({
    Severity: r.severity, Customer: r.c.name, Phone: r.c.phone||'', Type: r.svc?.type||'',
    Plan: r.svc?.plan||'', 'Length (days)': r.svc?.durationDays??'', Start: r.svc?.activationDate||'', End: r.svc?.expiryDate||'',
    Price: r.svc?.price ?? r.svc?.sellingPrice ?? '', Current: r.svc?.isActive===false ? 'past plan' : 'current', Problem: r.msg,
  }));
  if(!rows.length){ toast(LANG==='zh'?'没有需要核对的记录':'Nothing to export — everything matches'); return; }
  downloadXlsx(rows, 'Himobile_Plan_Check_'+todayISO()+'.xlsx', 'Plan check');
});

const dz = document.getElementById('dropzone');
dz.addEventListener('click', ()=> document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', e=>{ if(e.target.files[0]) handleImportFile(e.target.files[0]); });
dz.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', ()=> dz.classList.remove('drag'));
dz.addEventListener('drop', e=>{ e.preventDefault(); dz.classList.remove('drag'); if(e.dataTransfer.files[0]) handleImportFile(e.dataTransfer.files[0]); });

document.querySelectorAll('.lang-btn').forEach(b=>{
  b.addEventListener('click', ()=>{
    LANG = b.dataset.lang;
    localStorage.setItem(LANG_KEY, LANG);
    boot();
    toast(t('toast.langChanged'));
  });
});

/* ---------------- boot ---------------- */
function boot(){
  applyStaticI18n();
  renderNav();
  renderStaffProfileFoot();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+currentPage).classList.add('active');
  document.getElementById('pageTitle').textContent = t('nav.'+currentPage);
  document.getElementById('pageSub').textContent = t('sub.'+currentPage);
  renderPage(currentPage);
}
document.getElementById('navMenu').addEventListener('click', e=>{
  const item = e.target.closest('[data-nav]');
  if(item) goTo(item.getAttribute('data-nav'));
});
document.addEventListener('click', e=>{
  const navEl = e.target.closest('[data-nav]');
  if(navEl && navEl.closest('#navMenu')===null){ /* handled elsewhere for card links */ }
});

/* ---------------- lock screen ---------------- */
// Shown on every page load UNLESS this browser is already marked "stay unlocked" from a
// previous successful unlock — in which case it goes straight to loading the local cache
// and showing the app, no re-entry needed. The only way back to a locked state is the
// explicit Log out button, which also clears the local cache so nothing lingers behind.
function unlockApp(){
  document.getElementById('lockScreen').style.display = 'none';
  document.getElementById('appRoot').style.display = '';
  boot();
  startBackgroundSyncPolling();
  flushExpiryRepairToast();
}
/* Surfaces the one-time expiry-date repair (see repairMismatchedPrepaidExpiry) as a toast
   so it isn't a silent, invisible data change — staff should know some old records just had
   their expiry date corrected. Fires at most once per load, right after the app is unlocked
   and rendered, whether the repair ran during the initial local load or the follow-up
   server pull. */
let pendingExpiryRepairToast = 0;
function flushExpiryRepairToast(){
  if(!pendingExpiryRepairToast) return;
  const n = pendingExpiryRepairToast;
  pendingExpiryRepairToast = 0;
  setTimeout(()=> toast(LANG==='zh'
    ? `已自动修正 ${n} 个套餐的到期日期（与合同天数不匹配）`
    : `Auto-corrected the expiry date on ${n} plan(s) that didn't match their contract length`
  ), 400);
}
// Silently pulls fresh data from the server every 15 seconds while the app is just sitting
// open — without this, two computers only ever compared notes when someone happened to
// refresh, so a change on one could sit invisible on another for however long it stayed
// open. Only re-renders when something actually changed, so it doesn't interrupt whatever
// page someone's looking at for no reason.
let backgroundSyncInterval = null;
function startBackgroundSyncPolling(){
  if(backgroundSyncInterval) return; // never start a second one
  backgroundSyncInterval = setInterval(async ()=>{
    if(!isSyncEnabled()) return;
    if(document.hidden) return; // don't burn requests on a tab nobody's looking at
    if(hasPendingOrInFlightPush()) return; // don't let a pull race ahead of a not-yet-sent
    // local edit and silently overwrite it with the server's still-stale copy — try again
    // next cycle, by which point the push should have landed
    const before = JSON.stringify(DB.customers)+JSON.stringify(DB.services);
    const result = await pullFromServer({light:true});
    if(result.ok){
      const after = JSON.stringify(DB.customers)+JSON.stringify(DB.services);
      if(before !== after){
        // The underlying data is always kept fresh — that part is safe. But forcing a
        // visual re-render here was disrupting active work: Sheet View re-sorts and
        // rebuilds its whole table on every render, which visibly shifts rows around even
        // when the change had nothing to do with what someone was looking at, and if
        // someone had a cell mid-edit, replacing the table's HTML wiped out their unsaved
        // keystrokes entirely. Sheet View is where people spend the most time actively
        // typing, so it's deliberately skipped here — the fresh data is already in memory
        // and will show correctly the next time they switch tabs or reload, without ever
        // interrupting them mid-edit. A focused input/textarea/select anywhere else in the
        // app (e.g. a modal) is treated the same way, for the same reason.
        const activeTag = document.activeElement?.tagName;
        const isEditingSomething = activeTag==='INPUT' || activeTag==='TEXTAREA' || activeTag==='SELECT';
        if(currentPage!=='sheet' && !isEditingSomething){ renderPage(currentPage); }
        renderNav(); // safe everywhere — just badge counts, nothing a person is mid-editing
      }
    }
  }, 15000);
}
function isStayUnlocked(){ return localStorage.getItem(UNLOCKED_KEY)==='1'; }
if(isStayUnlocked()){
  // picks up wherever this browser left off: the real synced data if it was unlocked via
  // the server, or the blank local session if it was "skip" — either way, exactly what was
  // last showing before the refresh, with no password prompt in between
  const willSync = isSyncEnabled();
  if(willSync) suppressAutoPush = true; // see scheduleServerSync's comment — blocks a stale
  // local repair-triggered save from pushing before the corrective pull below has run
  DB = loadDB();
  unlockApp();
  // then silently refresh from the server in the background, using the already-saved
  // credentials — this is what makes "refresh to get the other computer's changes" work
  // without re-entering the password each time. Falls back to the local data above if the
  // server can't be reached, exactly like every other sync attempt in this app.
  if(willSync){
    pullFromServer().then(result=>{
      suppressAutoPush = false; // safe to push again — we've now reconciled with the server
      if(result.ok){ renderPage(currentPage); renderNav(); }
    });
  }
} else {
  document.getElementById('lockServerUrl').value = getServerUrl();
  document.getElementById('lockUnlockBtn').addEventListener('click', async ()=>{
    const url = document.getElementById('lockServerUrl').value.trim();
    const pwd = document.getElementById('lockPassword').value.trim();
    const errEl = document.getElementById('lockError');
    errEl.style.display = 'none';
    if(!url || !pwd){
      errEl.textContent = LANG==='zh' ? '请输入服务器地址与密钥' : 'Please enter both the server address and password';
      errEl.style.display = 'block';
      return;
    }
    const btn = document.getElementById('lockUnlockBtn');
    btn.disabled = true;
    setServerUrl(url);
    setApiKey(pwd);
    // enabled BEFORE the pull (not after) so that if the pull's automatic data repairs need
    // to save anything, that save correctly triggers a push back to the server right away
    // instead of silently no-op'ing because sync looked "not enabled yet" at that instant
    setSyncEnabled(true);
    const result = await pullFromServer();
    btn.disabled = false;
    if(result.ok){
      localStorage.setItem(UNLOCKED_KEY, '1');
      unlockApp();
    } else {
      // Only actually disable sync if the credentials themselves are confirmed wrong (a 401
      // from the server) — not for a generic connection failure. A failed unlock attempt
      // used to permanently turn sync off for this browser regardless of the reason, which
      // meant a temporary network hiccup (or, as happened once, a firewall issue that was
      // later fixed) could silently disable all future auto-sync indefinitely, with nothing
      // to signal that had happened beyond this one error message scrolling past.
      const isBadCredentials = /API key|密钥不正确/.test(result.error||'');
      if(isBadCredentials) setSyncEnabled(false);
      errEl.textContent = (LANG==='zh'?'连接或密钥错误：':'Connection or password error: ')+(result.error||'');
      errEl.style.display = 'block';
    }
  });
  document.getElementById('lockPassword').addEventListener('keydown', e=>{
    if(e.key==='Enter') document.getElementById('lockUnlockBtn').click();
  });
  document.getElementById('lockSkipBtn').addEventListener('click', ()=>{
    // a genuinely blank local session — deliberately does NOT use whatever might already be
    // cached in this browser from a previous unlock, so "skip" can never accidentally reveal
    // real data without the password having been entered this session
    setSyncEnabled(false);
    setApiKey(''); // a skipped (no-password) session must not inherit a saved key
    DB = {customers:[], services:[], templates:[], reminderState:{}, meta:{createdAt:Date.now()}};
    ensurePreetiTemplate(DB);
    saveDB(DB);
    localStorage.setItem(UNLOCKED_KEY, '1');
    unlockApp();
  });
}
document.getElementById('btnLogout').addEventListener('click', async ()=>{
  const msg = LANG==='zh'
    ? '退出登录后，本机缓存的客户数据会被清除，下次打开需要重新输入服务器地址与密钥。是否继续？'
    : 'Logging out clears this computer\'s cached customer data — next time you open this, you\'ll need to enter the server address and password again. Continue?';
  if(!confirm(msg)) return;
  // flush any pending debounced push FIRST — logging out reloads the page immediately
  // afterward, which would silently kill that timer and drop whatever was about to sync
  // (e.g. an edit made just before logging out) if this weren't awaited here
  if(isSyncEnabled()){
    clearTimeout(syncTimer);
    try{ await pushToServer(); }catch(e){ /* already handled/logged inside pushToServer */ }
  }
  localStorage.removeItem(UNLOCKED_KEY);
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(SYNC_ENABLED_KEY);
  // The key IS the password: leaving it behind meant anyone could press "Skip", open
  // Import / Export (key pre-filled) and pull every customer. The server address is kept
  // only as a convenience for the next login — it's useless without the key.
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
  location.reload();
});
// the lock screen's own text should reflect whatever language was last used, even though
// its language toggle isn't visible until after unlocking (the real toggle lives in the
// topbar, which is part of the hidden app content)
applyStaticI18n();

/* =====================================================================
   Former theme.js (merged 2026-11-10; folded into the screens 2026-11-12). What's left here
   are self-contained helpers: language strings, the light/dark toggle, the smooth dropdown and
   date pickers, the AI nationality card, the date-range picker and the new-customer form layout.
   ===================================================================== */
/* Chinese / English helper shared by the blocks below (follows the CRM's own language switch) */
(function(){
  var Z={'+ New customer':'+ 新增客户','Average stay by nationality':'各国籍平均停留时间','Expected years in Korea, from each customer record':'按每位客户记录的预计在韩年数','All months':'全部月份','No data for this month.':'本月暂无数据。','yrs':'年',
  'Switch to light mode':'切换到浅色模式','Switch to dark mode':'切换到深色模式','Active subscription':'当前订阅','Current plan':'当前套餐','Plan info':'套餐信息','Plan history':'套餐历史','Income':'收入','Show':'展开','Hide':'收起','More':'更多','Less':'收起',
  'Company':'公司','Carrier type':'运营商类型','Plan length':'套餐时长','Nationality':'国籍','Used':'已使用','Print':'打印','Copy phone number':'复制电话号码','Phone number copied':'电话号码已复制',
  'plan price':'套餐价','monthly discount':'每月优惠','Not accepted: customer is under 19':'不予受理：客户未满19岁','Month':'月份','Previous plan':'上一个套餐'};
  function zh(){try{return LANG==='zh';}catch(e){return false;}}
  window.__zh=zh;
  window.__T=function(s){return zh()&&Z[s]?Z[s]:s;};
})();

/* (The shared UI scheduler is gone: every screen now draws its final layout itself, so nothing
   needs to watch the page for changes any more.) */

/* Light / Dark toggle for the 365 Himobile CRM. Adds one round button to the top bar.
   Remembers the choice in this browser. Does not touch any CRM data or function. */
(function(){
  var KEY='himobile_theme';
  var MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  function read(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } }
  function write(v){ try{ localStorage.setItem(KEY,v); }catch(e){} }
  function current(){ return document.documentElement.getAttribute('data-theme')==='dark' ? 'dark' : 'light'; }
  function paint(){
    var b=document.getElementById('themeToggle'); if(!b) return;
    var dark=current()==='dark';
    b.innerHTML = dark ? SUN : MOON;
    b.title = b.ariaLabel = __T(dark ? 'Switch to light mode' : 'Switch to dark mode');
    b.setAttribute('aria-label', b.title);
  }
  function apply(t){ document.documentElement.setAttribute('data-theme',t); paint(); }
  // the button is now part of index.html (top bar) — just wire it up once
  var b=document.getElementById('themeToggle');
  if(b) b.addEventListener('click',function(){ var t=current()==='dark'?'light':'dark'; write(t); apply(t); });
  apply(read()==='dark' ? 'dark' : 'light');
})();

/* (plan-length tag: now planLengthLabel() + serviceCardHtml; styles in style.css) */
window.__planLab = planLengthLabel;

/* ===== AI page: "Average stay by nationality" card (styles in style.css; drawn by renderAIPage) ===== */
(function(){
  var COL=['#1f5bd8','#f26a21','#0b7a5e','#7c4dff','#d9a400','#c2385a','#2a8fd6','#6b7685'];
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]});}
  /* (dashboard banner is now plain markup in index.html, filled by renderDashboard) */
  function months(){
    var m={};(DB.customers||[]).forEach(function(c){var k=String(c.createdAt||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(k))m[k]=1;});
    return Object.keys(m).sort().reverse();}
  function ai(){
    var host=document.getElementById('aiStayCards'),page=document.getElementById('page-ai');
    if(!host||!page||typeof DB==='undefined')return;
    var c=document.getElementById('aiNatStay');
    if(!c){
      c=document.createElement('div');c.id='aiNatStay';c.className='card';
      c.innerHTML='<div class="ans-head"><div><div class="ans-title"></div><div class="ans-sub"></div></div><select id="ansMonth"></select></div><div id="ansBars"></div>';
      host.insertAdjacentElement('afterend',c);
      c.querySelector('select').onchange=function(){draw(true);};
    }
    c.querySelector('.ans-title').textContent=__T('Average stay by nationality');c.querySelector('.ans-sub').textContent=__T('Expected years in Korea, from each customer record');c.querySelector('select').setAttribute('aria-label',__T('Month'));
    var sel=c.querySelector('select'),ms=months(),sig=ms.join(',')+'|'+(__zh()?'z':'e');
    if(sel.getAttribute('data-sig')!==sig){
      var cur=sel.value;
      sel.innerHTML='<option value="">'+__T('All months')+'</option>'+ms.map(function(m){return'<option value="'+m+'">'+m+'</option>';}).join('');
      sel.value=cur;sel.setAttribute('data-sig',sig);}
    draw(false);
  }
  function draw(force){
    var c=document.getElementById('aiNatStay');if(!c)return;
    var mo=c.querySelector('select').value,agg={};
    (DB.customers||[]).forEach(function(x){
      if(mo&&String(x.createdAt||'').slice(0,7)!==mo)return;
      var y=parseFloat(x.years);if(!(y>0))return;
      var k=(x.nationality||'').trim();if(!k)return;
      var a=agg[k]||(agg[k]={s:0,n:0});a.s+=y;a.n++;});
    var rows=Object.keys(agg).map(function(k){return{k:k,n:agg[k].n,v:agg[k].s/agg[k].n};})
      .sort(function(a,b){return b.n-a.n;}).slice(0,8);
    var max=Math.max.apply(null,rows.map(function(r){return r.v;}).concat([0.1]));
    var sig=(__zh()?'z':'e')+mo+'|'+rows.map(function(r){return r.k+r.n+r.v.toFixed(2);}).join();
    var bars=document.getElementById('ansBars');
    if(!force&&bars.getAttribute('data-sig')===sig)return;
    bars.setAttribute('data-sig',sig);
    bars.innerHTML=rows.length?rows.map(function(r,i){
      return'<div class="ans-row"><span class="ans-name">'+esc(r.k)+'</span><span class="ans-track"><span class="ans-fill" style="display:block;width:0;background:'+COL[i%COL.length]+'" data-w="'+(r.v/max*100).toFixed(1)+'"></span></span><span class="ans-val">'+r.v.toFixed(1)+' '+__T('yrs')+' · '+r.n+'</span></div>';}).join('')
      :'<div class="ans-sub">'+__T('No data for this month.')+'</div>';
    requestAnimationFrame(function(){requestAnimationFrame(function(){bars.querySelectorAll('.ans-fill').forEach(function(f){f.style.width=f.getAttribute('data-w')+'%';});});});
  }
  window.renderNatStay=function(){try{ai();}catch(e){console.error('nationality stay card',e);}};
  var pa=document.getElementById('page-ai'); if(pa&&pa.classList.contains('active')) window.renderNatStay(); // page drawn before this ran
})();

/* ===== Smooth custom dropdown (replaces the harsh native option list) ===== */
(function(){
  var css=
  '.csel-menu{position:fixed;z-index:100000;min-width:160px;max-height:320px;overflow:auto;padding:6px;border-radius:16px;background:var(--card,#fff);border:1px solid var(--border,#e3e7ec);box-shadow:0 18px 48px rgba(10,20,50,.18);transform-origin:top left;animation:cselIn .16s cubic-bezier(.2,.8,.2,1) both;font-family:inherit}'+
  '@keyframes cselIn{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}'+
  '.csel-opt{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:40px;padding:0 14px;border-radius:11px;font-size:14.5px;font-weight:500;color:var(--text,#14181f);cursor:pointer;white-space:nowrap;transition:background .12s}'+
  '.csel-opt:hover,.csel-opt.hl{background:var(--blue-light,#e6edfb)}'+
  '.csel-opt.sel{color:var(--blue,#1f5bd8);font-weight:700}'+
  '.csel-opt.sel::after{content:"";width:14px;height:14px;flex:0 0 14px;background:no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%231f5bd8%27 stroke-width=%273%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M5 12l5 5L20 7%27/%3E%3C/svg%3E")}'+
  '.csel-opt.dis{opacity:.4;pointer-events:none}'+
  '.csel-sep{padding:8px 14px 4px;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-soft,#6b7685)}'+
  'html[data-theme="dark"] .csel-menu{box-shadow:0 18px 48px rgba(0,0,0,.5)}'+
  'html[data-theme="dark"] .csel-opt.sel{color:#8db0ff}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  var menu=null,cur=null,items=[],hl=-1;
  function close(){if(menu){menu.remove();menu=null;}if(cur){cur.removeAttribute('data-csel-open');cur=null;}items=[];hl=-1;}
  function pick(i){
    var o=items[i];if(!o||!cur)return;var sel=cur;
    sel.selectedIndex=o.idx;
    sel.dispatchEvent(new Event('input',{bubbles:true}));
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    close();try{sel.focus();}catch(e){}
  }
  function setHl(n){
    if(!items.length)return;hl=(n+items.length)%items.length;
    items.forEach(function(o,i){o.el.classList.toggle('hl',i===hl);});
    items[hl].el.scrollIntoView({block:'nearest'});
  }
  function open(sel){
    close();cur=sel;sel.setAttribute('data-csel-open','1');
    menu=document.createElement('div');menu.className='csel-menu';menu.setAttribute('role','listbox');
    var idx=0;
    Array.prototype.forEach.call(sel.children,function(ch){
      var opts=ch.tagName==='OPTGROUP'?ch.children:[ch];
      if(ch.tagName==='OPTGROUP'){var g=document.createElement('div');g.className='csel-sep';g.textContent=ch.label;menu.appendChild(g);}
      Array.prototype.forEach.call(opts,function(op){
        if(op.tagName!=='OPTION')return;
        var el=document.createElement('div');el.className='csel-opt'+(op.index===sel.selectedIndex?' sel':'')+(op.disabled?' dis':'');
        el.setAttribute('role','option');
        var tx=document.createElement('span');tx.textContent=op.textContent;el.appendChild(tx);
        var k=items.length;items.push({el:el,idx:op.index});
        el.addEventListener('mousedown',function(e){e.preventDefault();});
        el.addEventListener('click',function(e){e.stopPropagation();pick(k);});
        el.addEventListener('mouseenter',function(){setHl(k);});
        menu.appendChild(el);
      });
    });
    document.body.appendChild(menu);
    var r=sel.getBoundingClientRect(),mw=Math.max(r.width,160);
    menu.style.minWidth=mw+'px';
    var mh=Math.min(menu.scrollHeight,320),below=window.innerHeight-r.bottom-12;
    var top=below>=mh||below>r.top?r.bottom+6:Math.max(8,r.top-mh-6);
    var left=Math.min(r.left,window.innerWidth-menu.offsetWidth-12);
    menu.style.top=top+'px';menu.style.left=Math.max(8,left)+'px';
    var s=items.findIndex(function(o){return o.idx===sel.selectedIndex;});setHl(s<0?0:s);
    var se=items[s<0?0:s];if(se)se.el.scrollIntoView({block:'nearest'});
  }
  function ok(t){return t&&t.tagName==='SELECT'&&!t.multiple&&!t.disabled&&!(t.size>1)&&!t.hasAttribute('data-native');}
  document.addEventListener('mousedown',function(e){
    var t=e.target;
    if(menu&&!menu.contains(t)&&t!==cur){close();if(!ok(t))return;}
    if(ok(t)){e.preventDefault();if(cur===t){close();}else{t.focus();open(t);}}
  },true);
  document.addEventListener('keydown',function(e){
    var t=e.target;
    if(menu){
      if(e.key==='Escape'){e.preventDefault();close();}
      else if(e.key==='ArrowDown'){e.preventDefault();setHl(hl+1);}
      else if(e.key==='ArrowUp'){e.preventDefault();setHl(hl-1);}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(hl);}
      else if(e.key==='Tab'){close();}
      return;}
    if(ok(t)&&(e.key==='Enter'||e.key===' '||e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();open(t);}
  },true);
  window.addEventListener('resize',close);
  document.addEventListener('scroll',function(e){if(menu&&!menu.contains(e.target))close();},true);
})();

/* (Customer profile card layout, phone copy, print buttons and the ID-change under-19 rule are
   now part of openCustomerDetail / the ID-change modal themselves) */

/* ===== Smooth custom date picker (replaces the browser's harsh native calendar) ===== */
(function(){
  var pop=null,cur=null,vy=0,vm=0;
  function zhL(){try{return LANG;}catch(e){return 'en';}}
  function loc(){var l=zhL();return l==='zh'?'zh-CN':l==='ko'?'ko-KR':'en-US';}
  function pad(n){return (n<10?'0':'')+n;}
  function iso(y,m,d){return y+'-'+pad(m+1)+'-'+pad(d);}
  function ok(t){return t&&t.tagName==='INPUT'&&t.type==='date'&&!t.disabled&&!t.readOnly&&!t.hasAttribute('data-native');}
  function close(){if(pop){pop.remove();pop=null;}cur=null;}
  function setVal(v){
    if(!cur)return;var i=cur;i.value=v;
    i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function render(){
    if(!pop||!cur)return;
    var L=loc(),first=new Date(vy,vm,1),startDow=first.getDay(),days=new Date(vy,vm+1,0).getDate();
    var sel=cur.value,today=new Date(),ts=iso(today.getFullYear(),today.getMonth(),today.getDate());
    var title=new Intl.DateTimeFormat(L,{year:'numeric',month:'long'}).format(first);
    var wd=[];for(var i=0;i<7;i++){wd.push(new Intl.DateTimeFormat(L,{weekday:'short'}).format(new Date(2023,0,1+i)));}
    var h='<div class="dp-head"><button type="button" class="dp-nav" data-dp="-1" aria-label="Previous month">&#8249;</button><button type="button" class="dp-title" data-dp="ym"></button><button type="button" class="dp-nav" data-dp="1" aria-label="Next month">&#8250;</button></div><div class="dp-grid">';
    wd.forEach(function(w){h+='<span class="dp-wd">'+w+'</span>';});
    for(var b=0;b<startDow;b++)h+='<span></span>';
    for(var d=1;d<=days;d++){
      var s=iso(vy,vm,d),dis=(cur.min&&s<cur.min)||(cur.max&&s>cur.max);
      h+='<button type="button" class="dp-day'+(s===sel?' sel':'')+(s===ts?' today':'')+'"'+(dis?' disabled':'')+' data-d="'+s+'">'+d+'</button>';
    }
    var zh=L==='zh-CN',ko=L==='ko-KR';
    h+='</div><div class="dp-foot"><button type="button" class="dp-link" data-dp="today">'+(zh?'今天':ko?'오늘':'Today')+'</button>'+(cur.required?'':'<button type="button" class="dp-link" data-dp="clear">'+(zh?'清除':ko?'지우기':'Clear')+'</button>')+'</div>';
    pop.innerHTML=h;pop.querySelector('.dp-title').textContent=title;
  }
  function place(){
    var r=cur.getBoundingClientRect(),w=pop.offsetWidth||288,h=pop.offsetHeight||320;
    var below=window.innerHeight-r.bottom-12,top=below>=h||below>r.top?r.bottom+6:Math.max(8,r.top-h-6);
    pop.style.top=top+'px';pop.style.left=Math.max(8,Math.min(r.left,window.innerWidth-w-12))+'px';
  }
  function open(inp){
    close();cur=inp;
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(inp.value),n=new Date();
    vy=m?+m[1]:n.getFullYear();vm=m?+m[2]-1:n.getMonth();
    pop=document.createElement('div');pop.className='dp-pop';pop.setAttribute('role','dialog');
    document.body.appendChild(pop);render();place();
    pop.addEventListener('mousedown',function(e){e.preventDefault();});
    pop.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;e.stopPropagation();
      if(b.dataset.d){setVal(b.dataset.d);var i=cur;close();try{i.focus();}catch(x){}return;}
      var a=b.dataset.dp;
      if(a==='-1'||a==='1'){vm+=+a;if(vm<0){vm=11;vy--;}if(vm>11){vm=0;vy++;}render();}
      else if(a==='today'){var t=new Date();setVal(iso(t.getFullYear(),t.getMonth(),t.getDate()));close();}
      else if(a==='clear'){setVal('');close();}
    });
  }
  document.addEventListener('mousedown',function(e){
    var t=e.target;
    if(pop&&!pop.contains(t)&&t!==cur){close();}
    if(ok(t)){
      var r=t.getBoundingClientRect();
      if(e.clientX>r.right-40){e.preventDefault();t.focus();if(cur===t)close();else open(t);}
      else if(cur!==t){open(t);}
    }
  },true);
  document.addEventListener('click',function(e){if(ok(e.target)){e.preventDefault();}},true);
  document.addEventListener('keydown',function(e){var t=e.target;if(ok(t)&&(e.altKey&&e.key==='ArrowDown'||e.key==='F4')){e.preventDefault();if(!pop||cur!==t)open(t);}},true);
  document.addEventListener('keydown',function(e){if(pop&&e.key==='Escape'){close();}else if(pop&&e.key==='Tab'){close();}},true);
  window.addEventListener('resize',close);
  document.addEventListener('scroll',function(e){if(pop&&!pop.contains(e.target))close();},true);
})();

/* (Print templates page: search, carrier chips and card chips are now part of renderTemplates) */

/* ===== Date-range filter (Sheet View): presets + one calendar, no more two native pickers ===== */
(function(){
  var pop=null,pill=null,vy=0,vm=0,st='',en='',hov='';
  function Lg(){try{return LANG;}catch(e){return 'en';}}
  function loc(){var l=Lg();return l==='zh'?'zh-CN':l==='ko'?'ko-KR':'en-US';}
  var TX={en:{any:'Any activation date',all:'All time',today:'Today',yest:'Yesterday',d7:'Last 7 days',d30:'Last 30 days',tm:'This month',lm:'Last month',m3:'Last 3 months',ty:'This year',hint:'Pick a start and an end date'},
          zh:{any:'任意开通日期',all:'全部时间',today:'今天',yest:'昨天',d7:'最近7天',d30:'最近30天',tm:'本月',lm:'上月',m3:'最近3个月',ty:'今年',hint:'依次选择开始和结束日期'},
          ko:{any:'개통일 전체',all:'전체 기간',today:'오늘',yest:'어제',d7:'최근 7일',d30:'최근 30일',tm:'이번 달',lm:'지난달',m3:'최근 3개월',ty:'올해',hint:'시작일과 종료일을 선택하세요'}};
  function T(k){return (TX[Lg()]||TX.en)[k];}
  function pad(n){return (n<10?'0':'')+n;}
  function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function pd(s){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;}
  function fmt(s){var d=pd(s);return d?new Intl.DateTimeFormat(loc(),{month:'short',day:'numeric',year:'numeric'}).format(d):'';}
  function inputs(){return [document.getElementById('sheetDateFrom'),document.getElementById('sheetDateTo')];}
  function setRange(a,b){
    var i=inputs();if(!i[0]||!i[1])return;
    i[0].value=a||'';i[1].value=b||'';
    if(a||b){var rf=document.getElementById('sheetRecentFilter');if(rf&&rf.value!==''){rf.value='';rf.dispatchEvent(new Event('change',{bubbles:true}));}}
    [i[0],i[1]].forEach(function(x){x.dispatchEvent(new Event('input',{bubbles:true}));x.dispatchEvent(new Event('change',{bubbles:true}));});
    label();
  }
  function label(){
    var p=document.getElementById('sheetDateRangePill'),i=inputs();if(!p||!i[0])return;
    var b=p.querySelector('.dr-btn');if(!b)return;
    var a=i[0].value,z=i[1].value,t=a||z?(fmt(a)||'…')+' – '+(fmt(z)||'…'):T('any');
    if(b.textContent!==t)b.textContent=t;
    p.classList.toggle('dr-has',!!(a||z));
  }
  function setup(){
    var p=document.getElementById('sheetDateRangePill');if(!p||p.dataset.dr)return;
    p.dataset.dr='1';p.classList.add('dr-on');
    var b=document.createElement('button');b.type='button';b.className='dr-btn';
    var ic=p.querySelector('.date-range-icon');if(ic)ic.insertAdjacentElement('afterend',b);else p.insertBefore(b,p.firstChild);
    b.addEventListener('click',function(e){e.stopPropagation();if(pop){close();}else open(p);});
    label();
  }
  function close(){if(pop){pop.remove();pop=null;}pill=null;}
  function presets(){
    var n=new Date(),t=new Date(n.getFullYear(),n.getMonth(),n.getDate()),add=function(d,k){return new Date(d.getFullYear(),d.getMonth(),d.getDate()+k);};
    return [
      ['all','',''],['today',iso(t),iso(t)],['yest',iso(add(t,-1)),iso(add(t,-1))],['d7',iso(add(t,-6)),iso(t)],['d30',iso(add(t,-29)),iso(t)],
      ['tm',iso(new Date(t.getFullYear(),t.getMonth(),1)),iso(new Date(t.getFullYear(),t.getMonth()+1,0))],
      ['lm',iso(new Date(t.getFullYear(),t.getMonth()-1,1)),iso(new Date(t.getFullYear(),t.getMonth(),0))],
      ['m3',iso(new Date(t.getFullYear(),t.getMonth()-2,1)),iso(t)],
      ['ty',iso(new Date(t.getFullYear(),0,1)),iso(new Date(t.getFullYear(),11,31))]
    ];
  }
  function render(){
    if(!pop)return;
    var L=loc(),first=new Date(vy,vm,1),sd=first.getDay(),days=new Date(vy,vm+1,0).getDate(),ts=iso(new Date());
    var e2=en||hov;var lo=st&&e2&&e2<st?e2:st,hi=st&&e2&&e2<st?st:e2;
    var h='<div class="dr-presets">';
    presets().forEach(function(p){var on=(p[1]===st&&p[2]===en);h+='<button type="button" class="dr-pre'+(on?' on':'')+'" data-p="'+p[0]+'">'+T(p[0])+'</button>';});
    h+='</div><div class="dr-cal"><div class="dp-head"><button type="button" class="dp-nav" data-n="-1">&#8249;</button><span class="dp-title"></span><button type="button" class="dp-nav" data-n="1">&#8250;</button></div><div class="dp-grid">';
    for(var i=0;i<7;i++)h+='<span class="dp-wd">'+new Intl.DateTimeFormat(L,{weekday:'short'}).format(new Date(2023,0,1+i))+'</span>';
    for(var b=0;b<sd;b++)h+='<span></span>';
    for(var d=1;d<=days;d++){
      var s=vy+'-'+pad(vm+1)+'-'+pad(d),c='dp-day dr-day';
      if(lo&&hi&&s>=lo&&s<=hi)c+=' in';if(s===lo)c+=' edge s';if(s===hi)c+=' edge e';if(s===ts)c+=' today';
      h+='<button type="button" class="'+c+'" data-d="'+s+'">'+d+'</button>';
    }
    h+='</div><div class="dr-hint"></div></div>';
    pop.innerHTML=h;
    pop.querySelector('.dp-title').textContent=new Intl.DateTimeFormat(L,{year:'numeric',month:'long'}).format(first);
    pop.querySelector('.dr-hint').textContent=st&&!en?fmt(st)+' → …':(st&&en?fmt(st)+' → '+fmt(en):T('hint'));
  }
  function place(){
    var r=pill.getBoundingClientRect(),w=pop.offsetWidth,h=pop.offsetHeight;
    var below=window.innerHeight-r.bottom-12,top=below>=h||below>r.top?r.bottom+6:Math.max(8,r.top-h-6);
    pop.style.top=top+'px';pop.style.left=Math.max(8,Math.min(r.left,window.innerWidth-w-12))+'px';
  }
  function open(p){
    close();pill=p;var i=inputs();st=i[0].value;en=i[1].value;hov='';
    var base=pd(st)||pd(en)||new Date();vy=base.getFullYear();vm=base.getMonth();
    pop=document.createElement('div');pop.className='dr-pop';document.body.appendChild(pop);render();place();
    pop.addEventListener('mousedown',function(e){e.preventDefault();});
    pop.addEventListener('mouseover',function(e){var b=e.target.closest('.dr-day');if(b&&st&&!en&&b.dataset.d!==hov){hov=b.dataset.d;render();}});
    pop.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;e.stopPropagation();
      if(b.dataset.p){var p2=presets().filter(function(x){return x[0]===b.dataset.p;})[0];setRange(p2[1],p2[2]);st=p2[1];en=p2[2];hov='';var bd=pd(st);if(bd){vy=bd.getFullYear();vm=bd.getMonth();}render();if(!st)close();return;}
      if(b.dataset.n){vm+=+b.dataset.n;if(vm<0){vm=11;vy--;}if(vm>11){vm=0;vy++;}render();return;}
      if(b.dataset.d){
        var d=b.dataset.d;
        if(!st||(st&&en)){st=d;en='';hov='';setRange(d,'');render();}
        else{var a=st<d?st:d,z=st<d?d:st;setRange(a,z);close();}
      }
    });
  }
  document.addEventListener('mousedown',function(e){if(pop&&!pop.contains(e.target)&&!(pill&&pill.contains(e.target)))close();},true);
  function excl(e){var x=e.target;if(x&&x.id==='sheetRecentFilter'&&x.value!==''){var i=inputs();if(i[0]&&(i[0].value||i[1].value)){i[0].value='';i[1].value='';label();setTimeout(function(){try{renderSheetPage();}catch(er){}},0);}}}
  document.addEventListener('input',excl,true);document.addEventListener('change',excl,true);
  document.addEventListener('keydown',function(e){if(pop&&e.key==='Escape')close();},true);
  document.addEventListener('click',function(e){var c=e.target.closest&&e.target.closest('#sheetDateRangeClear');if(c)setTimeout(label,50);});
  window.addEventListener('resize',close);
  /* called by renderSheetPage (and once now) — no polling */
  window.dateRangeLabel=function(){try{setup();label();}catch(e){}};
  window.dateRangeLabel();
})();

/* ===== New customer form: cards, dropdowns, plan rows, date-of-birth picker, ID-expiry rule ===== */
(function(){
  var TX={
    zh:{'Customer':'客户信息','Application':'申请信息','Prepaid plan':'预付费套餐','Notes':'备注','Postpaid plan':'后付费套餐','Plan':'套餐','Company price & discount':'公司价格与折扣','Choose…':'请选择','Years':'年',
      'Type 6 digits: year, month, day':'输入6位数字：年月日','years old':'岁','under 19':'未满19岁','Pick the year':'选择年份','Pick the month':'选择月份','Pick the day':'选择日期','Close':'关闭','Clear':'清除',
      "Prepaid can't be made with this ARC":'此外国人登录证不能办理预付费','This ARC has already expired.':'此外国人登录证已过期。','A prepaid SIM needs at least 3 months of validity left. Ask the customer for a renewed ARC, or use a passport.':'预付费SIM要求证件至少还有3个月有效期。请客户更新证件，或改用护照。','days':'天','Plan type':'套餐类型','ID expiry date':'证件到期日','Fix the ID expiry date to save.':'请先处理证件到期日。','Not saved: ARC expires in less than 3 months':'未保存：外国人登录证有效期不足3个月'},
    ko:{'Customer':'고객 정보','Application':'신청 정보','Prepaid plan':'선불 요금제','Notes':'메모','Postpaid plan':'후불 요금제','Plan':'요금제','Company price & discount':'회사 가격 및 할인','Choose…':'선택','Years':'년',
      'Type 6 digits: year, month, day':'6자리 입력: 년월일','years old':'세','under 19':'19세 미만','Pick the year':'연도 선택','Pick the month':'월 선택','Pick the day':'일 선택','Close':'닫기','Clear':'지우기',
      "Prepaid can't be made with this ARC":'이 외국인등록증으로는 선불 개통 불가','This ARC has already expired.':'외국인등록증이 이미 만료되었습니다.','A prepaid SIM needs at least 3 months of validity left. Ask the customer for a renewed ARC, or use a passport.':'선불 유심은 유효기간이 3개월 이상 남아 있어야 합니다. 갱신된 등록증이나 여권을 사용하세요.','days':'일','Plan type':'가입 유형','ID expiry date':'증명서 만료일','Fix the ID expiry date to save.':'만료일을 확인하세요.','Not saved: ARC expires in less than 3 months':'저장 안 됨: 등록증 만료 3개월 미만'}
  };
  function lg(){try{return LANG;}catch(e){return 'en';}}
  function T(s){var d=TX[lg()];return (d&&d[s])||s;}
  function $(id){return document.getElementById(id);}
  function ov(){return $('customerModalOverlay');}
  function shown(o){return o&&o.classList.contains('show');}
  function isNew(){try{return editingCustomerId===null||editingCustomerId===undefined;}catch(e){return false;}}
  function vis(el){return !!el&&el.getClientRects().length>0;}
  function ico(d){return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';}
  var ICO={user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',doc:'<path d="M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9"/>',card:'<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M3 10h18"/>',bars:'<path d="M5 20V14M10 20V9M15 20V12M20 20V5"/>',coin:'<path d="M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.6 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3"/>',note:'<path d="M5 4h11l3 3v13H5z"/><path d="M8 11h8M8 15h5"/>'};
  function card(title,ic,cls){
    var c=document.createElement('section');c.className='nf-card '+(cls||'');
    c.innerHTML='<div class="nf-head"><span class="nf-ib">'+ico(ICO[ic])+'</span><span class="nf-ttl"></span></div><div class="nf-body"></div>';
    c.querySelector('.nf-ttl').textContent=T(title);c.dataset.t=title;return c;
  }
  function ff(id){var x=$(id);return x&&x.closest('.form-field');}
  function mv(body,ids){ids.forEach(function(id){var f=ff(id);if(f)body.appendChild(f);});}
  /* ---------- build / unbuild the card layout ---------- */
  function unbuild(form){
    if(!form||!form.dataset.nf)return;
    /* the prepaid box is turned into a card in place — undo that FIRST, so removing the
       cards below can never delete it (it used to: Edit profile then lost its prepaid
       fields and could not save, and the New customer form broke until a reload) */
    var p=$('prepaid3mFields');if(p){p.classList.remove('nf-card');var h=p.querySelector(':scope > .nf-head');if(h)h.remove();}
    (form.__nfOrig||[]).forEach(function(n){form.appendChild(n);});
    (form.__nfCards||[]).forEach(function(c){c.remove();});form.__nfCards=null;
    form.classList.remove('nf','nf-pre','nf-post');delete form.dataset.nf;
    /* put back the Plan type options the new-customer layout trimmed — but only if they are still
       trimmed (opening a form rebuilds them anyway), and keep whatever is selected, including
       "nothing": restoring stale options used to select 신규가입 over a customer's blank value */
    var sel=$('f_planType');
    if(sel&&sel.__all){
      if(sel.options.length<=2){var idx=sel.selectedIndex,v=sel.value;sel.innerHTML='';sel.__all.forEach(function(o){sel.appendChild(o);});if(idx<0)sel.selectedIndex=-1;else sel.value=v;}
      sel.__all=null;
    }
    document.querySelectorAll('.nf-extra').forEach(function(x){x.remove();});
    ['f_carrierType','p3_number'].forEach(function(id){var f=ff(id);if(f)f.style.display='';});
    var nm=$('p3_company_group'),sc=$('p3_svcCarrierType_group');[nm,sc].forEach(function(g){if(g){g.style.display='';var m=$(g.id+'_mirror');if(m)m.remove();}});
  }
  function buildPre(form){
    if(form.dataset.nf==='pre')return;
    unbuild(form);
    form.__nfOrig=[].slice.call(form.children);
    var c1=card('Customer','user'),c2=card('Application','doc'),c4=card('Notes','note');
    var b1=c1.querySelector('.nf-body'),b2=c2.querySelector('.nf-body'),b4=c4.querySelector('.nf-body');
    mv(b1,['f_name','f_phone','f_nationality','f_dob','f_idType_group','f_idNumber','f_idExpiry','f_occupation_group','f_years','f_referral']);
    mv(b2,['f_planType','f_branchOffice','f_handlerName','f_address','f_rating']);
    mv(b4,['f_notes']);
    var p=$('prepaid3mFields');
    form.insertBefore(c1,form.firstChild);form.insertBefore(c2,c1.nextSibling);
    if(p){p.classList.add('nf-card');var h=document.createElement('div');h.className='nf-head';h.innerHTML='<span class="nf-ib">'+ico(ICO.card)+'</span><span class="nf-ttl"></span>';h.querySelector('.nf-ttl').textContent=T('Prepaid plan');p.insertBefore(h,p.firstChild);form.insertBefore(p,c2.nextSibling);}
    form.insertBefore(c4,(p&&p.nextSibling)||null);
    form.__nfCards=[c1,c2,c4];
    form.classList.add('nf','nf-pre');form.dataset.nf='pre';
  }
  /* ---------- helpers ---------- */
  function chipVals(g){return [].slice.call(g.querySelectorAll('.tile-radio')).map(function(c){return c.getAttribute('data-val');});}
  function mirror(gid,label){
    var g=$(gid);if(!g)return;var fld=g.closest('.form-field');
    var m=$(gid+'_mirror'),vals=chipVals(g);
    if(!vals.length)return;
    var labs=[].slice.call(g.querySelectorAll('.tile-radio')).map(function(c){return c.textContent.trim();});
    var sig=vals.join('|')+'|'+labs.join('|')+'|'+lg();
    if(!m){m=document.createElement('select');m.id=gid+'_mirror';m.className='select-input nf-mirror';fld.appendChild(m);
      m.addEventListener('change',function(){var v=m.value;var c=[].slice.call(g.querySelectorAll('.tile-radio')).filter(function(x){return x.getAttribute('data-val')===v;})[0];if(c)c.click();});}
    g.style.display='none';
    if(m.dataset.sig!==sig){m.dataset.sig=sig;m.innerHTML='<option value="">'+T('Choose…')+'</option>'+vals.map(function(v,i){return '<option value="'+String(v).replace(/"/g,'&quot;')+'">'+String(labs[i]||v).replace(/</g,'&lt;')+'</option>';}).join('');}
    var cur=g.dataset.selected||'';if(m.value!==cur)m.value=cur;
  }
  var PL={'15':{ic:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',t:'15 days',s:'Short stay',c:'o'},'30':{ic:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',t:'1 month',s:'30 days',c:'g'},'60':{ic:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4"/>',t:'2 months',s:'60 days',c:'b'},'90':{ic:'<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z"/>',t:'3 months',s:'90 days',c:'v'}};
  var PLZ={zh:{'15 days':'15天','1 month':'1个月','2 months':'2个月','3 months':'3个月','Short stay':'短期','30 days':'30天','60 days':'60天','90 days':'90天'},ko:{'15 days':'15일','1 month':'1개월','2 months':'2개월','3 months':'3개월','Short stay':'단기','30 days':'30일','60 days':'60일','90 days':'90일'}};
  function pz(s){var d=PLZ[lg()];return (d&&d[s])||s;}
  function planTiles(){
    var g=$('p3_prepaidPlan_group');if(!g)return;
    [].slice.call(g.querySelectorAll('.tile-radio')).forEach(function(c){
      var d=c.getAttribute('data-val'),P=PL[d];if(!P)return;
      var price=((c.getAttribute('data-nfp'))||(c.textContent.split('·')[1]||'').trim());
      var sig=d+'|'+price+'|'+lg();
      if(c.dataset.nfs===sig)return;
      c.dataset.nfs=sig;c.setAttribute('data-nfp',price);c.classList.add('nf-plan','nf-'+P.c);
      c.innerHTML='<span class="nf-pb">'+ico(P.ic).replace('width="17" height="17"','width="26" height="26"')+'</span><span class="nf-pm"><b>'+pz(P.t)+'</b><i>'+pz(P.s==='Short stay'?'Short stay':P.s)+'</i></span><span class="nf-pc">'+price+'</span><span class="nf-pr"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></span>';
    });
  }
  function carrierNet(v){v=String(v||'');if(/SKT/i.test(v))return 'SKT';if(/LGU|LG/i.test(v))return 'LG';if(/KT/i.test(v))return 'KT';return '';}
  /* ---------- date-of-birth drill picker (year → month → day) ---------- */
  var DP={pop:null,inp:null,view:'year',yp:1993,vy:2000,vm:0,fmt:'yymmdd'};
  function pad(n){return (n<10?'0':'')+n;}
  function parseDob(inp){
    var v=(inp.value||'').trim();
    if(inp.type==='date'){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);return m?{y:+m[1],m:+m[2],d:+m[3]}:null;}
    var dg=v.replace(/\D/g,'');var y,mo,d;
    if(dg.length===6){var yy=+dg.slice(0,2);y=yy>(new Date().getFullYear()%100)?1900+yy:2000+yy;mo=+dg.slice(2,4);d=+dg.slice(4,6);}
    else if(dg.length===8){y=+dg.slice(0,4);mo=+dg.slice(4,6);d=+dg.slice(6,8);}
    else return null;
    var t=new Date(y,mo-1,d);if(t.getFullYear()!==y||t.getMonth()!==mo-1||t.getDate()!==d)return null;
    return {y:y,m:mo,d:d};
  }
  function ageOf(p){var n=new Date(),a=n.getFullYear()-p.y;if(n.getMonth()+1<p.m||(n.getMonth()+1===p.m&&n.getDate()<p.d))a--;return a;}
  function dobInfo(inp){
    var f=inp.closest('.form-field');if(!f)return;var el=f.querySelector('.nf-dobinfo');
    if(!el){el=document.createElement('div');el.className='nf-dobinfo';f.appendChild(el);}
    var p=parseDob(inp),txt='',cls='';
    if(p){var a=ageOf(p);txt=new Date(p.y,p.m-1,p.d).toLocaleDateString(lg()==='zh'?'zh-CN':lg()==='ko'?'ko-KR':'en-US',{month:'short',day:'numeric',year:'numeric'})+' · '+a+(lg()==='en'?' '+T('years old'):T('years old'))+(a<19?' · '+T('under 19'):'');cls=a<19?'warn':'ok';}
    else if(inp.value){txt='';}
    else txt=T('Type 6 digits: year, month, day');
    if(el.textContent!==txt)el.textContent=txt;el.className='nf-dobinfo '+cls;
  }
  function dpClose(){if(DP.pop){DP.pop.remove();DP.pop=null;}DP.inp=null;}
  function dpWrite(y,m,d){
    var inp=DP.inp;if(!inp)return;
    inp.value=inp.type==='date'?(y+'-'+pad(m)+'-'+pad(d)):(pad(y%100)+pad(m)+pad(d));
    inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));dobInfo(inp);
  }
  function dpRender(){
    var pop=DP.pop;if(!pop)return;
    var h='<div class="nf-dh"><button type="button" class="nf-dn" data-a="p">&#8249;</button><button type="button" class="nf-dt" data-a="up"></button><button type="button" class="nf-dn" data-a="n">&#8250;</button></div><div class="nf-ds"></div>';
    var title='',step='',cur=parseDob(DP.inp);
    if(DP.view==='year'){
      title=DP.yp+' – '+(DP.yp+15);step='1/3 · '+T('Pick the year');h+='<div class="nf-dg4">';
      for(var i=0;i<16;i++){var y=DP.yp+i;h+='<button type="button" class="nf-dc'+(cur&&cur.y===y?' sel':'')+'" data-y="'+y+'">'+y+'</button>';}h+='</div>';
    }else if(DP.view==='month'){
      title=String(DP.vy);step='2/3 · '+T('Pick the month');h+='<div class="nf-dg3">';
      for(var k=0;k<12;k++){var nm=new Date(2000,k,1).toLocaleDateString(lg()==='zh'?'zh-CN':lg()==='ko'?'ko-KR':'en-US',{month:'short'});h+='<button type="button" class="nf-dc'+(cur&&cur.y===DP.vy&&cur.m===k+1?' sel':'')+'" data-m="'+k+'">'+nm+'</button>';}h+='</div>';
    }else{
      var first=new Date(DP.vy,DP.vm,1),sd=first.getDay(),dim=new Date(DP.vy,DP.vm+1,0).getDate();
      title=first.toLocaleDateString(lg()==='zh'?'zh-CN':lg()==='ko'?'ko-KR':'en-US',{month:'long',year:'numeric'});step='3/3 · '+T('Pick the day');h+='<div class="nf-dg7">';
      for(var w=0;w<7;w++)h+='<span class="nf-dw">'+new Date(2023,0,1+w).toLocaleDateString(lg()==='zh'?'zh-CN':lg()==='ko'?'ko-KR':'en-US',{weekday:'short'})+'</span>';
      for(var b=0;b<sd;b++)h+='<span></span>';
      for(var d=1;d<=dim;d++)h+='<button type="button" class="nf-dd'+(cur&&cur.y===DP.vy&&cur.m===DP.vm+1&&cur.d===d?' sel':'')+'" data-d="'+d+'">'+d+'</button>';
      h+='</div>';
    }
    h+='<div class="nf-df"><button type="button" class="nf-dl" data-a="x">'+T('Close')+'</button></div>';
    pop.innerHTML=h;pop.querySelector('.nf-dt').textContent=title;pop.querySelector('.nf-ds').textContent=step;
  }
  function dpPlace(){
    var r=DP.inp.getBoundingClientRect(),p=DP.pop,w=p.offsetWidth||296,hh=p.offsetHeight||340;
    var below=window.innerHeight-r.bottom-10,top=below>=hh||below>r.top?r.bottom+6:Math.max(8,r.top-hh-6);
    p.style.top=top+'px';p.style.left=Math.max(8,Math.min(r.left,window.innerWidth-w-12))+'px';
  }
  function dpOpen(inp){
    dpClose();DP.inp=inp;var cur=parseDob(inp);
    DP.vy=cur?cur.y:2000;DP.vm=cur?cur.m-1:0;DP.yp=DP.vy-7;DP.view='year';
    var pop=document.createElement('div');pop.className='nf-dpop';pop.tabIndex=-1;document.body.appendChild(pop);DP.pop=pop;
    pop.addEventListener('mousedown',function(e){e.preventDefault();});
    pop.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;e.stopPropagation();
      var a=b.dataset.a;
      if(b.dataset.y){DP.vy=+b.dataset.y;DP.view='month';}
      else if(b.dataset.m){DP.vm=+b.dataset.m;DP.view='day';}
      else if(b.dataset.d){dpWrite(DP.vy,DP.vm+1,+b.dataset.d);dpClose();return;}
      else if(a==='x'){dpClose();return;}
      else if(a==='up'){DP.view=DP.view==='day'?'month':'year';}
      else if(a==='p'||a==='n'){var k=a==='n'?1:-1;if(DP.view==='year')DP.yp+=16*k;else if(DP.view==='month')DP.vy+=k;else{DP.vm+=k;if(DP.vm<0){DP.vm=11;DP.vy--;}if(DP.vm>11){DP.vm=0;DP.vy++;}}}
      dpRender();
    });
    dpRender();dpPlace();
  }
  document.addEventListener('mousedown',function(e){
    var t=e.target;
    if(DP.pop&&!DP.pop.contains(t)&&t!==DP.inp)dpClose();
  },true);
  document.addEventListener('click',function(e){
    var t=e.target;
    if(t&&t.classList&&t.classList.contains('nf-dob')){e.preventDefault();if(DP.inp===t&&DP.pop)dpClose();else dpOpen(t);}
  },true);
  document.addEventListener('keydown',function(e){if(DP.pop&&(e.key==='Escape'||e.key==='Tab'))dpClose();},true);
  document.addEventListener('scroll',function(e){if(DP.pop&&!DP.pop.contains(e.target)){dpPlace();}},true);
  window.addEventListener('resize',dpClose);
  function dobSetup(id){
    var i=$(id);if(!i||i.dataset.nfd)return;i.dataset.nfd='1';i.classList.add('nf-dob');i.setAttribute('data-native','1');i.autocomplete='off';
    i.addEventListener('input',function(){dobInfo(i);});
  }
  /* ---------- years stepper ---------- */
  function stepper(id){
    var i=$(id);if(!i||i.dataset.nfs)return;i.dataset.nfs='1';
    var w=document.createElement('div');w.className='nf-step';
    var mk=function(sign){var b=document.createElement('button');b.type='button';b.className='nf-stp';b.setAttribute('aria-label',sign>0?'More (0.5)':'Less (0.5)');b.innerHTML=sign>0?'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>':'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg>';
      b.addEventListener('click',function(){var v=parseFloat(i.value);if(isNaN(v))v=0;v=Math.max(0,Math.round((v+sign*0.5)*2)/2);i.value=String(v);i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));});return b;};
    i.parentNode.insertBefore(w,i);w.appendChild(mk(-1));w.appendChild(i);w.appendChild(mk(1));
    w.parentNode.classList.add('nf-years');
  }
  /* ---------- ARC expiry rule (prepaid) ---------- */
  function arcState(){
    var g=$('f_idType_group'),ex=$('f_idExpiry');
    if(!g||!ex||!ex.value)return {block:false};
    if((g.dataset.selected||'ARC')!=='ARC')return {block:false};
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(parseExpiryFlexible(ex.value));if(!m)return {block:false}; // 6-digit typing since 2026-11-11
    var d=new Date(+m[1],+m[2]-1,+m[3]),n=new Date(),lim=new Date(n.getFullYear(),n.getMonth()+3,n.getDate()),t0=new Date(n.getFullYear(),n.getMonth(),n.getDate());
    if(d>=lim)return {block:false};
    return {block:true,days:Math.round((d-t0)/86400000)};
  }
  function arcUI(on){
    var f=$('f_idExpiryField'),g=$('f_idType_group');if(!f||!g)return;
    var isArc=(g.dataset.selected||'ARC')==='ARC';
    /* Only the NEW prepaid form controls this field. On Edit Profile the CRM shows ID expiry
       for every ID type (so missing expiry dates can be filled in) — hiding it there every
       250 ms made that impossible. */
    if(on)f.style.display=isArc?'':'none';
    else if(!isNew()&&f.style.display==='none')f.style.display='';
    var w=$('nfArcWarn');
    var st=on&&isArc?arcState():{block:false};
    if(!st.block){if(w)w.remove();}
    else{
      if(!w){w=document.createElement('div');w.id='nfArcWarn';w.className='nf-warn full';w.setAttribute('role','alert');f.insertAdjacentElement('afterend',w);}
      var msg=st.days<0?T('This ARC has already expired.'):({en:'This ARC expires in '+st.days+' days.',zh:'此证件将在'+st.days+'天后到期。',ko:'등록증이 '+st.days+'일 후 만료됩니다.'})[lg()];
      var sig=msg+lg();
      if(w.dataset.s!==sig){w.dataset.s=sig;w.innerHTML='<b></b><span></span>';w.firstChild.textContent=T("Prepaid can't be made with this ARC");w.lastChild.textContent=msg+' '+T('A prepaid SIM needs at least 3 months of validity left. Ask the customer for a renewed ARC, or use a passport.');}
    }
    ['saveCustomerBtn','savePrintCustomerBtn'].forEach(function(id){var b=$(id);if(b)b.classList.toggle('nf-dis',!!(on&&st.block));});
  }
  /* called at the top of both save functions: true = blocked (and says why) */
  window.newCustomerArcBlocked=function(){
    tick();
    var b=$('saveCustomerBtn');
    if(b&&b.classList.contains('nf-dis')){try{toast(T('Not saved: ARC expires in less than 3 months'));}catch(x){}return true;}
    return false;
  };
  /* ---------- per-open setup and ticking ---------- */
  var wasOn=false;
  function today(){var n=new Date();return n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate());}
  function tickPre(form){
    var pre=isNew()&&vis($('prepaid3mFields'));
    if(!pre){if(form.dataset.nf==='pre')unbuild(form);arcUI(false);return;}
    buildPre(form);
    /* plan type: only new sign-up or number port */
    var pt=$('f_planType');
    if(pt&&pt.options.length>2){pt.__all=pt.__all||[].slice.call(pt.options);var keep=[].slice.call(pt.options).filter(function(o){return /신규가입|번호이동/.test(o.value+o.text);}).slice(0,2);var cur=pt.value;pt.innerHTML='';keep.forEach(function(o){pt.appendChild(o);});if(keep.some(function(o){return o.value===cur;}))pt.value=cur;}
    /* carrier network is taken from the carrier type; SIM phone from the phone field */
    var cf=ff('f_carrierType');if(cf)cf.style.display='none';
    var pf=ff('p3_number');if(pf)pf.style.display='none';
    var sc=$('p3_svcCarrierType_group'),cn=$('f_carrierType');
    if(sc&&cn){var net=carrierNet(sc.dataset.selected);if(net&&cn.value!==net)cn.value=net;}
    var ph=$('f_phone'),pn=$('p3_number');if(ph&&pn&&pn.value!==ph.value&&document.activeElement!==pn)pn.value=ph.value;
    mirror('p3_company_group','Company');mirror('p3_svcCarrierType_group','Carrier type');
    planTiles();dobSetup('f_dob');dobInfo($('f_dob'));stepper('f_years');arcUI(true);
    var ad=$('p3_activationDate');if(ad&&!ad.value)ad.value=today();
  }
  /* ---------- postpaid new-customer modal ---------- */
  function ovP(){return $('newPostpaidModalOverlay');}
  function buildPost(form){
    if(form.dataset.nf==='post')return;
    var groups=[
      ['Customer','user',['pc_name','pc_nationality','pc_dob','pc_idType_group','pc_idNumber','pc_occupation','pc_years']],
      ['Application','doc',['pc_workType_group','pc_handlerName_group']],
      ['Postpaid plan','card',['pc_plan_group','pc_contractLength_group','pc_company_group','pc_partnerCompany_group','pc_svcCarrierType_group','pc_number','pc_activationDate','pc_monthlyFee','pc_simType_group']],
      ['Company price & discount','coin',['pc_expectedProfit','pc_usimFee','pc_discountPerMonth','pc_discountMonths','pc_netExpectedPreview']],
      ['Notes','note',['pc_referralFriend','pc_notes']]
    ];
    var made=groups.map(function(g){var c=card(g[0],g[1]);mv(c.querySelector('.nf-body'),g[2]);return c;});
    made.forEach(function(c){form.appendChild(c);});
    form.classList.add('nf','nf-post');form.dataset.nf='post';
  }
  function tickPost(){
    var o=ovP();if(!o)return;
    var form=o.querySelector('.modal-body > .form-grid');if(!form)return;
    buildPost(form);
    var w=$('pc_workType_group');
    if(w){
      var wo=[];try{wo=JSON.parse(w.dataset.options||'[]');}catch(e){}
      var wl=ff('pc_workType_group');var lb=wl&&wl.querySelector('label');
      if(wo.length!==2||!w.dataset.selected){var ws=w.dataset.selected;if(['신규가입','번호이동'].indexOf(ws)<0)ws='신규가입';renderCompactOptionField('pc_workType_group',['신규가입','번호이동'],ws,T('Plan type'));}
      if(lb&&lb.textContent!==T('Plan type')){lb.removeAttribute('data-i18n');lb.textContent=T('Plan type');}
    }
    var cl=$('pc_contractLength_group');
    if(cl){
      var co=[];try{co=JSON.parse(cl.dataset.options||'[]');}catch(e){}
      if(co.length!==2||co.indexOf('185')>=0){var cs=cl.dataset.selected;if(['245','365'].indexOf(cs)<0)cs='245';renderCompactOptionField('pc_contractLength_group',['245','365'],cs,cl.dataset.title||'Contract length');}
    }
    chipsFor('pc_contractLength_group',' '+T('days'));
    mirror('pc_plan_group');
    dobSetup('pc_dob');dobInfo($('pc_dob'));stepper('pc_years');
  }
  function chipsFor(gid,suffix){
    var g=$(gid);if(!g)return;
    var opts=[];try{opts=JSON.parse(g.dataset.options||'[]');}catch(e){}
    if(!opts.length)return;
    var cid=gid+'_chips',row=$(cid);
    if(!row){row=document.createElement('div');row.id=cid;row.className='nf-chips';g.insertAdjacentElement('afterend',row);
      row.addEventListener('click',function(e){var b=e.target.closest('.nf-chip');if(!b)return;var cur=$(gid);var o=[];try{o=JSON.parse(cur.dataset.options||'[]');}catch(x){}
        renderCompactOptionField(gid,o,b.getAttribute('data-v'),cur.dataset.title);});}
    g.style.display='none';
    var sel=g.dataset.selected||'';var sig=opts.join('|')+'|'+sel+'|'+lg();
    if(row.dataset.sig===sig)return;row.dataset.sig=sig;
    row.innerHTML='';
    opts.forEach(function(v){var b=document.createElement('button');b.type='button';b.className='nf-chip'+(v===sel?' on':'');b.setAttribute('data-v',v);b.textContent=v+suffix;row.appendChild(b);});
  }
  function tick(){
    var po=ovP();if(po&&shown(po)){tickPost();}
    var o=ov(),form=$('customerForm');if(!o||!form)return;
    if(!shown(o)){wasOn=false;if(!(ovP()&&shown(ovP())))dpClose();return;}
    if(!wasOn){wasOn=true;}
    tickPre(form);
  }
  window.refreshCustomerForms=function(){try{tick();}catch(e){console.error('customer form layout',e);}};
  ['input','change','click'].forEach(function(t){
    document.addEventListener(t,function(e){
      var x=e.target;if(x&&x.closest&&x.closest('#customerModalOverlay,#newPostpaidModalOverlay'))setTimeout(window.refreshCustomerForms,0);
    });
  });
})();
