import type { Page } from '@playwright/test';
import type { WorkItem, WorkEvent, WorkMutation } from '@worklens/contracts';

export async function seed(page: Page) {
  await page.addInitScript(() => {
    const repo = {id:'repo:fixture',name:'fixture',path:'/fixture',commonDir:'/fixture/.git',trusted:false};
    const source = {source:'test fixture',collectedAt:'2026-09-10T10:00:00Z',status:'available',detail:null,revision:'abc123'};
    const worktree = {id:'tree:main',path:'/fixture',head:'abc123',branch:'feature/cockpit',locked:false,prunable:false};
    const git = {repository:repo,branch:worktree.branch,head:'abc123',changes:[{path:'libs/core/src/lib.rs',previousPath:null,indexStatus:' ',worktreeStatus:'M'}],branches:[{name:'main',head:'def456',upstream:'origin/main',tracking:'[behind 1]'}],remotes:[{name:'origin',url:'git@github.com:example/fixture.git'}],worktrees:[worktree],commits:[{sha:'abc123',parents:['def456'],author:'Example',date:'2026-09-10T10:00:00Z',subject:'Connect local work'}],nextOffset:null,provenance:source};
    const graph = {nodes:[{id:'nx:web',name:'web',root:'apps/web',kind:'app',ecosystem:'nx',manifest:'apps/web/package.json',external:false,targets:['build'],features:[]},{id:'cargo:core',name:'core',root:'libs/core',kind:'crate',ecosystem:'cargo',manifest:'libs/core/Cargo.toml',external:false,targets:['check'],features:['default']}],edges:[{source:'nx:web',target:'cargo:core',kind:'project_dependency',evidence:'declared',origin:'fixture project.json'}],sources:[source]};
    const agent={id:'agent:fixture',repositoryId:repo.id,worktree:repo.path,tool:'Example agent',objective:'Connect the cockpit',state:'waiting',message:'Review ready',lastSeen:source.collectedAt,presence:'unknown',issue:null,pr:'https://github.com/example/fixture/pull/7'};
    const pr={id:7,number:7,title:'Connect local delivery',state:'open',user:{login:'example'},updated_at:source.collectedAt,html_url:'https://github.com/example/fixture/pull/7',body:'A readable change.',head:{sha:'abc123',ref:'feature/cockpit',repo:{full_name:'example/fixture'}}};
    const envelope=(data:unknown)=>({data,page:1,perPage:30,provenance:source});
    const section=(data:unknown)=>({data,error:null});
    let connected=false;
    const workItems = new Map<string,WorkItem>();
    const workEvents = new Map<string,WorkEvent[]>();
    Object.assign(window,{__WORKLENS_TRANSPORT__:async (request:{operation:string;params:Record<string,unknown>})=>{
      let data:unknown=null;
      switch(request.operation){
        case 'work_list':data={items:[...workItems.values()].filter(w=>(!request.params.reference||w.links.some(l=>l.reference===request.params.reference))&&(!request.params.state||w.state===request.params.state)),nextOffset:null};break;
        case 'work_show':data={item:workItems.get(String(request.params.id)),events:workEvents.get(String(request.params.id))??[],nextOffset:null};break;
        case 'work_create':case 'work_update':case 'work_link':case 'work_unlink':case 'work_note':{
          const p=request.params as unknown as WorkMutation;
          const c=p.change;
          let item=workItems.get(p.id);
          if(item&&item.revision!==p.expectedRevision)return {version:1,data:null,error:'Revision conflict: reload the work item'};
          if(c.action==='create')item={id:p.id,repositoryId:repo.id,title:c.title,objective:c.objective,criteria:c.criteria,state:'todo',revision:0,links:c.links,createdAt:source.collectedAt,updatedAt:source.collectedAt};
          if(!item)return {version:1,data:null,error:'Work item not found'};
          if(c.action==='update')Object.assign(item,{title:c.title,objective:c.objective,criteria:c.criteria,state:c.state});
          if(c.action==='link')item.links=[...item.links.filter(l=>l.kind!==c.link.kind||l.reference!==c.link.reference),c.link];
          if(c.action==='unlink')item.links=item.links.filter(l=>l.kind!==c.kind||l.reference!==c.reference);
          item={...item,revision:item.revision+1};workItems.set(item.id,item);
          workEvents.set(item.id,[{eventId:p.eventId,revision:item.revision,action:c.action,actor:p.actor,createdAt:source.collectedAt,details:c},...(workEvents.get(item.id)??[])]);
          data={applied:true,item};break;
        }
        case 'recent':data=[repo];break;
        case 'open':data=repo;break;
        case 'git':case 'status':data=git;break;
        case 'projects':case 'graph':data=graph;break;
        case 'tasks':data={taskGraph:{tasks:{'web:build':{},'core:check':{}},dependencies:{'web:build':['core:check']}}};break;
        case 'agents':data=[agent];break;
        case 'diff':data={text:'-before\n+after',truncated:false,binary:false,provenance:source};break;
        case 'prs':data=envelope([pr]);break;
        case 'issues':data=envelope([{id:8,number:8,title:'Improve graph navigation',state:'open',user:{login:'example'},updated_at:source.collectedAt}]);break;
        case 'ci':data=envelope({workflow_runs:[{id:9,name:'CI',head_sha:'abc123',head_branch:'feature/cockpit',conclusion:'success',status:'completed'}]});break;
        case 'pr':data=envelope({pr,files:section([{filename:'libs/core/src/lib.rs',patch:'-before\n+after'}]),reviews:section([]),comments:section([]),checks:section({check_runs:[{id:1,name:'Rust tests',conclusion:'success'}]}),statuses:section({statuses:[]}),runs:section({workflow_runs:[]})});break;
        case 'pr_impact':data={collection:{revision:{baseRepository:'example/fixture',headRepository:'example/fixture',baseSha:'def456',headSha:'abc123',expectedFiles:101},files:Array.from({length:101},(_,i)=>({path:i===100?'apps/web/page-two.ts':`libs/core/${i}.rs`,previousPath:null,status:'modified'})),pagesCollected:2,revisionVerified:true,provenance:source,warnings:[]},graphSources:[source],graphWorktree:repo.path,graphHead:'abc123',graphMatchesHead:false,impact:{direct:[{project:graph.nodes[1],paths:['libs/core/0.rs']},{project:graph.nodes[0],paths:['apps/web/page-two.ts']}],dependants:[],unmatched:[],transversal:[]},warnings:['Local graph is dirty; impact is approximate.']};break;
        case 'impact':data={direct:['cargo:core'],dependants:['nx:web'],warning:'Impact estimate, not validation proof.'};break;
        case 'documents':data=[{path:'README.md',title:'README.md'}];break;
        case 'document':data={path:'README.md',text:'# Fixture\n\nLocal project.\n<script>window.pwned=true</script>',provenance:source};break;
        case 'context':data={markdown:'### git\n\nSource: fixture',items:[],nextOffset:null};break;
        case 'search':data={projects:graph.nodes,documents:[],agents:[]};break;
        case 'trust':repo.trusted=request.params.trusted===true;data={...repo};break;
        case 'github_auth_status':data={connected,clientId:'Iv1.fixture'};break;
        case 'github_auth_start':data={id:'device',userCode:'ABCD-EFGH',verificationUri:'https://github.com/login/device',interval:1,expiresIn:900};break;
        case 'github_auth_poll':connected=true;data={status:'connected'};break;
        case 'github_logout':connected=false;data={connected};break;
        case 'doctor':data={tools:[{tool:'git',available:true,version:'git version 2.50.0'}],protocol:1,dataDirectory:'/fixture-data'};break;
        default:return {version:1,data:null,error:`Not configured in fixture: ${request.operation}`};
      }
      return {version:1,data:structuredClone(data),error:null};
    }});
  });
  await page.goto('/');
  await page.getByRole('textbox',{name:'Repository path',exact:true}).fill('/fixture');
  await page.getByRole('button',{name:'Open repository',exact:true}).click();
}
