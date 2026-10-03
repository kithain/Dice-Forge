-- Read-only export of the application schemas. Auth credentials are excluded.
-- Export the single JSON result outside Git before an incremental deployment.
begin isolation level repeatable read;
create temporary table df_release_snapshot (backup jsonb) on commit preserve rows;
do $$
declare source_table record; contents jsonb; tables jsonb := '{}'; sequences jsonb := '{}';
begin
 for source_table in select n.nspname as schema, c.relname as name from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','diceforge_v2') and c.relkind='r' order by 1,2 loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I t',source_table.schema,source_table.name) into contents;
  tables := tables || jsonb_build_object(source_table.schema||'.'||source_table.name,contents);
 end loop;
 for source_table in select n.nspname as schema,c.relname as name from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','diceforge_v2') and c.relkind='S' loop
  execute format('select jsonb_build_object(''last_value'',last_value,''is_called'',is_called) from %I.%I',source_table.schema,source_table.name) into contents;
  sequences := sequences || jsonb_build_object(source_table.schema||'.'||source_table.name,contents);
 end loop;
 insert into df_release_snapshot select jsonb_build_object(
  'captured_at',clock_timestamp(),'project_ref','bwrylcvkplonkfhnegvm',
  'data',tables,'sequence_values',sequences,
  'auth_user_ids',(select jsonb_agg(id) from auth.users),
  'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'acl',n.nspacl,'owner',pg_get_userbyid(n.nspowner))) from pg_namespace n where n.nspname in ('public','diceforge_v2')),
  'tables',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'acl',c.relacl,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
   'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)))
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','diceforge_v2') and c.relkind='r'),
  'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'identity_args',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner)))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','diceforge_v2') and p.prokind='f'),
  'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',k.conname,'kind',k.contype,'definition',pg_get_constraintdef(k.oid)))
   from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','diceforge_v2')),
  'indexes',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',ic.relname,'definition',pg_get_indexdef(i.indexrelid)))
   from pg_index i join pg_class c on c.oid=i.indrelid join pg_class ic on ic.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','diceforge_v2') and not exists(select 1 from pg_constraint k where k.conindid=i.indexrelid)),
  'triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)))
   from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','diceforge_v2') and not t.tgisinternal),
  'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in ('public','diceforge_v2')),
  'grants',(select jsonb_agg(to_jsonb(p)) from information_schema.table_privileges p where table_schema in ('public','diceforge_v2')),
  'column_grants',(select jsonb_agg(to_jsonb(p)) from information_schema.column_privileges p where table_schema in ('public','diceforge_v2')),
  'default_acl',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'role',pg_get_userbyid(d.defaclrole),'kind',d.defaclobjtype,'acl',d.defaclacl)) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('public','diceforge_v2')),
  'views',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid),'acl',c.relacl,'options',c.reloptions)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','diceforge_v2') and c.relkind='v'),
  'sequences',(select jsonb_agg(to_jsonb(s)) from pg_sequences s where schemaname in ('public','diceforge_v2')),
  'extensions',(select jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname,'version',e.extversion)) from pg_extension e join pg_namespace n on n.oid=e.extnamespace)
 );
end $$;
commit;
select backup from df_release_snapshot;
