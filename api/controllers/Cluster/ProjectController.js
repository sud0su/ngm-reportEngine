/**
 * ProjectController
 *
 * @description :: Server-side logic for managing auths
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

// libs
var Promise = require('bluebird');
var util = require('util');
var json2csv = require('json2csv');
var moment = require('moment');
var async = require('async');
var _under = require('underscore');
var $nin_organizations = [ 'immap', 'arcs' ];

var REPORTING_DUE_DATE_NOTIFICATIONS_CONFIG = sails.config.REPORTING_DUE_DATE_NOTIFICATIONS_CONFIG;

// project controller
var ProjectController = {

  // TASKS

  // parse results from sails
  set_result: function( result ) {
    if( util.isArray( result ) ) {
      // update ( array )
      return result[0];
    } else {
      // create ( object )
      return result;
    }
  },

  // return reports for a project
  getProjectReports: function( project, cb ) {

    const admin0pcode = project.admin0pcode ? project.admin0pcode : "ALL";
    let config = REPORTING_DUE_DATE_NOTIFICATIONS_CONFIG.find(obj => obj.admin0pcode === admin0pcode);
    if (!config) config = REPORTING_DUE_DATE_NOTIFICATIONS_CONFIG.find(obj => obj.admin0pcode === 'ALL');

    const REPORTING_DUE_DATE = config.reporting_due_date;

    // dates
    var project_start = moment( project.project_start_date ).startOf( 'M' ),
        project_end = moment( project.project_end_date ).endOf( 'M' ),
        reports_end = moment().endOf( 'M' );

    // variables
    var reports = [],
        s_date = project_start < reports_end ? project_start : reports_end,
        e_date = project_end < reports_end ? project_end : reports_end;

    // number of reports
    var reports_duration = moment.duration( e_date.diff( s_date ) ).asMonths().toFixed(0);

    // reports_duration array
    var reports_array = Array(parseInt( reports_duration )).fill().map((item, index) => 0 + index);

    // prepare project for cloning
    var p = JSON.parse( JSON.stringify( project ) );
    delete p.id;
    delete p.createdAt;
    delete p.updatedAt;

    
    
    if (!project.report_type_id || project.report_type_id !== 'bi-weekly') {
      
      async.each(reports_array, function (m, next) {

        // create report
        var report = {
          project_id: project.id,
          report_status: 'todo',
          report_active: true,
          report_month: moment(s_date).add(m, 'M').month(),
          report_year: moment(s_date).add(m, 'M').year(),
          reporting_period: moment(s_date).add(m, 'M').set('date', 1).format(),
          reporting_due_date: moment(s_date).add(m + 1, 'M').set('date', REPORTING_DUE_DATE).format()
        };

        // add report with p to reports
        reports.push(_under.extend({}, report, p));

        // next
        next();

      }, function (err) {
        if (err) return cb(err, false);
        // return the reports for the project period
        return cb(false, reports);
      });
    }

    if (project.report_type_id && project.report_type_id === 'bi-weekly') {
      var bi_weekly_reporting = [
        {
          // reporting_period: 1,
          // reporting_due_date: 10
          reporting_period: 1,
          reporting_due_date: 19,
          period_biweekly: 1
        }, {
          // reporting_period: 15,
          // reporting_due_date: 27
          reporting_period: 16,
          reporting_due_date: 4,
          period_biweekly: 2
        }
      ];
      
      async.each(reports_array, function (m, next) {

        bi_weekly_reporting.forEach(function(w){

          // create report
          var report = {
            project_id: project.id,
            report_status: 'todo',
            report_active: true,
            report_month: moment(s_date).add(m, 'M').month(),
            report_year: moment(s_date).add(m, 'M').year(),
            reporting_period: moment(s_date).add(m, 'M').set('date', w.reporting_period).format(),
            reporting_due_date: moment(s_date).add(m, 'M').set('date', w.reporting_due_date).format()
          };
          if (w.period_biweekly > 1) {
            report.reporting_due_date = moment(s_date).add(m + 1, 'M').set('date', w.reporting_due_date).format()
          }

          // add report with p to reports
          reports.push(_under.extend({}, report, p));
        });
        // next
        next();

      }, function (err) {
        if (err) return cb(err, false);
        // return the reports for the project period
        return cb(false, reports);
      });
    }
    

  },

  // return locations for reports
  getProjectReportLocations: function( reports, target_locations, cb ){

    // report locations
    var locations = [];

    // async loop target_beneficiaries
    async.each( reports, function ( report, next ) {

      // clone report
      var r = JSON.parse( JSON.stringify( report ) );

      // prepare report for cloning
      r.report_id = r.id.valueOf();
      delete r.id;
      delete r.createdAt;
      delete r.updatedAt;
      delete r.implementing_partners;

      // async loop target_beneficiaries
      async.each( target_locations, function ( target_location, tl_next ) {

        // prepare report for cloning
        var l = JSON.parse( JSON.stringify( target_location ) );
        l.target_location_reference_id = l.id.valueOf();
        delete l.id;
        delete l.createdAt;
        delete l.updatedAt;

        // push to locations
        locations.push( _under.extend( {}, r, l ) );

        // tl next
        tl_next();

      }, function ( err ) {
        if ( err ) return cb( err, false );
        next();
      });

    }, function ( err ) {
      if ( err ) return cb( err, false );
      return cb( false, locations );
    });

  },


  // REST APIs

  // get all Projects by organization
  getProjectsList: function(req, res) {

    // request input
    if ( !req.param('filter') ) {
      return res.json(401, { err: 'filter required!' });
    }

    if (req.param('filter').year && req.param('filter').year !== 'all') {
      var year = req.param('filter').year;
      var start = new Date(moment([year]));
      var end = new Date(moment([year]).endOf('year'));

      // filter projects that contain the year
      req.param('filter').project_start_date = { $lte: end };
      req.param('filter').project_end_date = { $gte: start };
    }
    delete req.param('filter').year;

    // get project by organization_id & status
    Project
      .find( req.param( 'filter' ) )
      .sort('updatedAt DESC')
      .exec(function(err, projects){

        // return error
        if (err) return res.negotiate( err );

        // else
        return res.json(200, projects);

      });

  },

  // get distinct sectors
  getProjectSectors: function( req, res ) {

    // organization_id required
    // if ( !req.param('organization_tag') ) {
    //   return res.json(401, { err: 'organization_id required!' });
		// }

		if (!req.param('filter')) {
			return res.json(401, { msg: 'filter required' });
		}
    // get project by organization_id & status
    Project
			.find( req.param('filter') )
      .exec( function( err, projects ){

        // return error
        if (err) return res.negotiate( err );

        // uniq cluster_id
        var distinct_sectors = _.uniq( projects, function( x ){
          return x.cluster_id;
        });

        // else
        return res.json( 200, distinct_sectors );

      });

  },


  // get projects summary
  getProjects: function(req, res){

      // Guards
      var reqQuery = req.param('query');

      if (!req.param('id') && !reqQuery) {
        return res.json(401, { err: 'params required!' });
      }

    var allowedParams =
      ['project_id', 'organization_id', 'cluster_id', 'organization_tag', 'implementer_id', 'project_type_component', 'activity_type_id', 'hrpplan', 'adminRpcode', 'admin0pcode', 'admin1pcode', 'admin2pcode', 'project_start_date', 'project_end_date', 'donor_id', 'report_type_id', 'project_detail'];


      // if dissallowed parameters sent
      if (reqQuery && _.difference(Object.keys(reqQuery), allowedParams).length > 0) {
        return res.json(401, { err: 'ivalid query params!' });
      }

      // build query object
      // legacy `id` api backward compatibility
      if (req.param('id')) {
        var query = { project_id: req.param('id') };
        var queryProject = { id: req.param('id') };
      } else {

        // copy resquest object
        var query = Object.assign({}, reqQuery);

        // use uppercase admin
        if (query.adminRpcode === "hq") delete query.adminRpcode;
        if (query.adminRpcode) query.adminRpcode = query.adminRpcode.toUpperCase();
        if (query.admin0pcode) query.admin0pcode = query.admin0pcode.toUpperCase();

        // 4wplus ---
        // donor filter from 4wplus project plan and activities dashboards
        if ( reqQuery.donor_id ) {
          query.project_donor = { $elemMatch: { 'project_donor_id': reqQuery.donor_id } };
          delete query.donor_id;
        }

        // implementing partner filter from 4wplus project plan and activities dashboards
        if( reqQuery.implementer_id ){
          query.implementing_partners = { $elemMatch: { 'organization_tag': reqQuery.implementer_id } };
          delete query.implementer_id;
        }

        //project type and is hrp plan? filter from 4wplus project plan and activities dashboards
        if ( reqQuery.project_type_component && (reqQuery.hrpplan && reqQuery.hrpplan === 'true') ) {

          query.plan_component = { $in: [reqQuery.project_type_component, 'hrp_plan'] };
          delete query.project_type_component;
          delete query.hrpplan;

        } else if ( reqQuery.project_type_component && (reqQuery.hrpplan && reqQuery.hrpplan === 'false') ) {

          query.plan_component = { $in: [reqQuery.project_type_component], $nin: ['hrp_plan']};
          delete query.project_type_component;
          delete query.hrpplan;

        } else if ( reqQuery.project_type_component && !reqQuery.hrpplan ) {

          query.plan_component = {$in: [reqQuery.project_type_component]};
          delete query.project_type_component;

        } else if ( !reqQuery.project_type_component && (reqQuery.hrpplan && reqQuery.hrpplan === 'true') ) {

          query.plan_component = {$in: ['hrp_plan']};
          delete query.hrpplan;

        } else if ( !reqQuery.project_type_component && (reqQuery.hrpplan && reqQuery.hrpplan === 'false') ) {
          query.plan_component = {$nin: ['hrp_plan']};
          delete query.hrpplan;
        }

        //activity type filter from 4wplus project plan and activities dashboards
        if( reqQuery.activity_type_id ){

          query.activity_type = { $elemMatch: { 'activity_type_id': reqQuery.activity_type_id } };
          delete query.activity_type_id;

        }
        // end 4wplus ---

        // exclude immap
        if (!reqQuery.organization_tag && !reqQuery.project_id) {
          query.organization_tag = { '$nin': $nin_organizations };
        }

        // project_start_date and project_end_date filters
        if (reqQuery.project_start_date && reqQuery.project_end_date) {
          var ped = new Date(reqQuery.project_end_date);
          var psd = new Date(reqQuery.project_start_date);
          query.project_start_date = { $lte: ped };
          query.project_end_date = { $gte: psd };
        }

        if (reqQuery.cluster_id) {
          // include multicluster projects
          query.$or = [{ cluster_id: reqQuery.cluster_id }, { "activity_type.cluster_id": reqQuery.cluster_id }]
          delete query.cluster_id
        }

        
        if(reqQuery.project_detail){
          query.project_details = { $elemMatch: { "project_detail_id": reqQuery.project_detail } }
          delete query.project_detail;
        }

        if (reqQuery.report_type_id && reqQuery.report_type_id !== 'all'){
          query.report_type_id = reqQuery.report_type_id === 'bi-weekly' ?  reqQuery.report_type_id  : { '!': 'bi-weekly' };
        }

        // pick props for locations
        queryLocations = _.pick(query, ['project_id', 'adminRpcode', 'admin0pcode', 'admin1pcode', 'admin2pcode', 'project_start_date', 'project_end_date', 'organization_tag']);

        // use admin1,2 only for locations
        delete query.admin1pcode;
        delete query.admin2pcode;

        queryProject = Object.assign({}, query);

        // if query by project id
        if ( reqQuery.project_id ) {
          queryProject.id = queryProject.project_id;
          delete queryProject.project_id;
        }

    }

    var csv = req.param('csv');

    // process request pipeline
    var pipe = Promise.resolve()
      .then(function(){ return actions._getProjectData(queryProject, query, queryLocations) })
      .then(function(data){ return actions._addProjectData(data) })
      .then(function(data){ return actions._processCollections(data) })
      .then(function($project){ return actions._doResponse($project) })
      .catch(function(err){ return err === 'NO PROJECT' } , function(err) { return actions._errorNoProjectRes(err) })
      .catch(function(err){ return actions._error(err) });

    // pipeline actions definitions
    var actions = {

    _error : function(err){
      return res.negotiate(err);
    },

    _errorNoProjectRes : function(err){
      return res.json( 200, { data: "NO PROJECTS" } );
    },

    _getProjectData : function(queryProject, query, queryLocations){

                  // total beneficiaries by project
                  var queryBeneficiaries =  new Promise((resolve, reject) => {
                    Beneficiaries.native((err, collection) => {
                      if (err) reject(err)
                      else collection.aggregate([
                        {
                          $match: query
                        },
                        { $group:
                            { _id: "$project_id",
                                total:
                                  { $sum:
                                      {
                                          "$add":  [ { "$ifNull": ["$total_beneficiaries", 0] } ]
                                      }
                                  },
                                totalcluster:
                                  { $sum:
                                      {
                                        $cond: {
                                          if: reqQuery.cluster_id,
                                          then: { $cond: { if: { $eq: ["$cluster_id", reqQuery.cluster_id] }, then: { "$ifNull": ["$total_beneficiaries", 0] }, else: 0 } },
                                          else: { "$ifNull": ["$total_beneficiaries", 0] }
                                        }
                                      }
                                  }
                            }
                        }
                      ]).toArray((err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                      });
                    })
                  });

                  return Promise.props({
                    project: Project.find( queryProject ),
                    budget: BudgetProgress.find( query ),
                    targetbeneficiaries: TargetBeneficiaries.find( query ),
                    targetlocations: TargetLocation.find( queryLocations ),
                    beneficiaries: queryBeneficiaries,
                  })

    },

    _addProjectData : function(data){

      var unique_project_ids = _.uniq(data.project.map(project => project.id));
      var unique_organization_ids = _.uniq(data.project.map(project => project.organization_id));

      data.documents = Documents.find({ project_id: { $in: unique_project_ids } });
      data.organizations = Organization.find({ id: { $in: unique_organization_ids } });

      return Promise.props(data)

    },

    _processCollections : function(data){

      // no project found
      if ( !data.project.length ) return Promise.reject('NO PROJECT');

      //new Projects array to print in the csv
       $projectsToPrint = [];

      //admin1pcode filter, filter the projects by admin1pcode --- 4wplus
      if (queryLocations.admin1pcode) {

        async.each(data.project, function (pro) {

          const exist2 = _.filter(data.targetlocations, { 'project_id': pro.id });

          if (exist2.length > 0) {

            $projectsToPrint.push(pro);

          }

        });

      } else {

        $projectsToPrint = data.project

      }

      // all projects
      $project = [];

      var _comparatorBuilder = this._comparatorBuilder

      // populate & sort fields
      var uppendDataToProject = function(project, i){

                    var projectId = project.id;
                    //var i = data.project.indexOf(project);
                    // var i = $projectsToPrint.indexOf(project);

                    // assemble project data
                    $project[i] = project;
                    $project[i].project_budget_progress = _.filter(data.budget, { 'project_id' : projectId}) ;
                    $project[i].target_beneficiaries = _.filter(data.targetbeneficiaries, { 'project_id' : projectId}) ;
                    $project[i].target_locations = _.filter(data.targetlocations,       { 'project_id' : projectId}) ;
                    $project[i].documents = _.filter(data.documents,       { 'project_id' : projectId}) ;
                    $project[i].total_beneficiaries_arr = _.filter(data.beneficiaries, { '_id': projectId });
                    $project[i].total_beneficiaries = $project[i].total_beneficiaries_arr.length ? $project[i].total_beneficiaries_arr[0].total : 0;
                    $project[i].total_cluster_beneficiaries = $project[i].total_beneficiaries_arr.length ? $project[i].total_beneficiaries_arr[0].totalcluster : 0;

                    $project[i].organization_info = _.filter(data.organizations, { 'id': project.organization_id });

                    if($project[i].organization_info.length ){

                      $project[i].organization_name = $project[i].organization_info[0].organization_name;

                    } else {
                      $project[i].organization_name = '';
                    };

                    // total of target beneficiaries
                    $project[i].total_target_beneficiaries = 0;
                    $project[i].total_cluster_target_beneficiaries = 0;
                    $project[i].target_beneficiaries.forEach(function (tb) {
                      var sum = tb.boys + tb.girls + tb.men + tb.women + tb.elderly_men + tb.elderly_women;
                      $project[i].total_target_beneficiaries += sum;
                      if(reqQuery.cluster_id && tb.cluster_id === reqQuery.cluster_id) {
                        $project[i].total_cluster_target_beneficiaries += sum;
                      }
                    })

                    /// order
                    $project[i].target_beneficiaries
                               .sort(function(a, b){ return a.id.localeCompare( b.id ) });
                    $project[i].project_budget_progress
                               .sort(function(a, b){ return a.id > b.id });
                    $project[i].target_locations
                               .sort(function(a, b){
                                  if (a.site_type_name){
                                    if(a.admin3name){
                                      return eval(_comparatorBuilder(['admin1name','admin2name','admin3name','site_type_name','site_name']));
                                    } else {
                                      return eval(_comparatorBuilder(['admin1name','admin2name','site_type_name','site_name']));
                                    }
                                  } else {
                                      if( a.admin3name){
                                        return eval(_comparatorBuilder(['admin1name','admin2name','admin3name','site_name']));
                                      } else {
                                        return eval(_comparatorBuilder(['admin1name','admin2name','site_name']));
                                      }
                                    }
                    });

                    $project[i].project_start_date = moment($project[i].project_start_date).format('YYYY-MM-DD');
                    $project[i].project_end_date   = moment($project[i].project_end_date).format('YYYY-MM-DD');
                    $project[i].createdAt          = moment( $project[i].createdAt ).format('YYYY-MM-DD');
                    $project[i].updatedAt          = moment( $project[i].updatedAt ).format('YYYY-MM-DD');

                    baseUrl = req.param('url') ? req.param('url') : req.protocol + '://' + req.host + "/desk/#/cluster/projects/details/";
                    $project[i].url = baseUrl + projectId;
                    // callback if error or post work can be called here `cb()`;
                };

      //async.each(data.project, uppendDataToProject);


      async.eachOf($projectsToPrint, uppendDataToProject);


      return $project;
    },

    // build a to b localeCompare from array of props
    _comparatorBuilder : function(compareObj){
        var compareArr = [];
        compareObj.forEach( function (criteria, i ) {
          compareArr.push('a'+'.'+criteria + '.' + 'localeCompare(b.' + criteria + ')');
        });
        return compareArr.join('||')
    },

    // do response
    _doResponse : function($project){
      if (csv) {


        //columns to COL or columns to others countries
        if (queryProject.admin0pcode === 'COL') {

          // var fields = [ 'cluster', 'organization', 'admin0name', 'id', 'project_status', 'name', 'email', 'phone','project_code','project_title', 'project_description', 'project_start_date', 'project_end_date', 'project_budget', 'project_budget_currency','urls_list', 'project_gender_marker','project_donor_list' , 'implementing_partners_list','componente_humanitario','plan_hrp_plan','componente_construccion_de_paz','componente_desarrollo_sostenible','plan_interagencial','componente_flujos_migratorios','plan_rmrp_plan','strategic_objectives_list', 'beneficiary_type_list','activity_type_list','target_beneficiaries_list','undaf_desarrollo_paz_list','acuerdos_de_paz_list','dac_oecd_development_assistance_committee_list','ods_objetivos_de_desarrollo_sostenible_list', 'target_locations_list','createdAt']

          // fieldNames = [ 'Cluster', 'Organización',  'País', 'Project ID', 'Estado del Proyecto', 'Punto Focal', 'Email', 'Teléfono', 'Código del Proyecto','Título del Proyecto',  'Descripción del Proyecto', 'Fecha Inicio del Proyecto', 'Fecha Finalización del Proyecto', 'Presupuesto del Proyecto', 'Moneda de Presupuesto del Proyecto','Soporte Documentos del Proyecto','Marcador de Género - GAM', 'Donantes del Proyecto'  ,  'Socios Implementadores', 'Componente Humanitario', 'Plan HRP','Componente Construcción de Paz','Componente Desarrollo Sostenible','Plan Interagencial','Componente Flujos Migratorios','Plan RMRP','Strategic Objectives', 'Beneficiary types','Tipos de Actividades','Beneficiarios Objetivo', 'Undaf Desarrollo Paz','Acuerdos de Paz','DAC - OECD Development Assistance Committee','ODS - Objetivos de Desarrollo Sostenible','Ubicaciones Objetivo','Fecha Creación'];
          var fields = ['cluster', 'organization', 'organization_name', 'admin0name', 'id', 'project_status', 'name', 'email', 'phone', 'project_code', 'project_title', 'project_description', 'project_start_date', 'project_end_date', 'project_budget', 'project_budget_currency', 'urls_list', 'project_gender_marker', 'project_donor_list', 'implementing_partners_list', 'strategic_objectives_list', 'beneficiary_type_list', 'activity_type_list', 'target_beneficiaries_list', 'plan_component_list', 'undaf_desarrollo_paz_list', 'acuerdos_de_paz_list', 'dac_oecd_development_assistance_committee_list', 'ods_objetivos_de_desarrollo_sostenible_list', 'target_locations_list', 'createdAt'];

          var fieldNames = ['Cluster', 'Organization', 'Organization Name', 'Country', 'Project ID', 'Project Status', 'Focal Point', 'Email', 'Phone', 'Project Organization Code', 'Project Title', 'Project Description', 'Project Start Date', 'Project End Date', 'Project Budget', 'Project Budget Currency', 'Project Documents', 'Gender Marker - GAM', 'Project Donors', 'Implementing Partners', 'Strategic Objectives', 'Beneficiary types', 'Activity types', 'Target Beneficiaries', 'Componentes de Respuesta', 'Undaf Desarrollo Paz', 'Acuerdos de Paz', 'DAC - OECD Development Assistance Committee', 'ODS - Objetivos de Desarrollo Sostenible', 'Target Locations', 'Creation Date'];



        } else {
          var fields = ['cluster', 'organization', 'admin0name', 'id', 'project_status', 'project_details_list', 'name', 'email', 'phone', 'project_title', 'project_description', 'project_hrp_code', 'project_start_date', 'project_end_date', 'project_budget', 'project_budget_currency', 'project_donor_list', 'implementing_partners_list', 'strategic_objectives_list', 'beneficiary_type_list', 'hrp_beneficiary_type_list', 'activity_type_list', 'target_beneficiaries_list', 'target_locations_list', 'createdAt', 'updatedAt', 'total_target_beneficiaries', 'total_beneficiaries', 'url'];
          var fieldNames = ['Cluster', 'Organization', 'Country', 'Project ID', 'Project Status', 'Project Details', 'Focal Point', 'Email', 'Phone', 'Project Title', 'Project Description', 'HRP Project Code', 'project_start_date', 'project_end_date', 'Project Budget', 'Project Budget Currency', 'Project Donors', 'Implementing Partners', 'Strategic Objectives', 'Beneficiary types', 'HRP Beneficiary Type', 'Activity types', 'Target Beneficiaries', 'Target locations', 'Created', 'Last Updated', 'Planned Beneficiaries', 'Services to Beneficiaries', 'URL'];
          // add cluster only totals
          if (reqQuery.cluster_id) {
            fields.push('total_cluster_target_beneficiaries', 'total_cluster_beneficiaries');
            fieldNames.push(reqQuery.cluster_id.toUpperCase() + ' Planned Beneficiaries', reqQuery.cluster_id.toUpperCase() + ' Services to Beneficiaries');
          }
        }

        $project = this._projectJson2Csv($project);

        json2csv({ data: $project, fields: fields, fieldNames: fieldNames}, function( err, csv ) {
          if ( err ) return res.negotiate( err );
          return res.json( 200, { data: csv } );
        });

      } else {
      // return Project
      return res.json( 200, $project.length===1?$project[0]:$project );
      }
    },

    // flatten subdocuments values
    // takes array of projects
    _projectJson2Csv : function(projects){

        var setKey = function(p, keyfrom, keyto, array, removeDuplicates){
          if ( p.hasOwnProperty(keyfrom)&&Array.isArray(p[keyfrom]) ) {
                var pa = [];
                p[keyfrom].forEach( function( p,i ){
                  if(p&&typeof p==='object'&&p!==null){
                    var ka = [];
                    var row = array.forEach(function( v,i ){
                      if (v.substring(0,4)==='key:'){
                        if (p.hasOwnProperty(v.substring(4))){
                          ka.push( v.substring(4)+':'+p[v.substring(4)] );
                        }
                      }else{
                        if (p.hasOwnProperty(v)) ka.push( p[v] );
                      }
                    });
                    var kl = ka.join(',');
                    if (p && (!removeDuplicates || (removeDuplicates && !pa.includes(kl)))) pa.push(kl);
                  } //else if (p) pa.push(p);
                    //if old no obj array benef format
                });
              p[keyto] = pa.join('; ');
            }
          };

          //to COL: change true, false values in components and plan columns

          var changevalues = function(val){
            var object;

            if(val == undefined){
              object = "";
            }else if(val == false){
              object = "NO";
            }else if(val == true){
              object = "SI";
            }
            return object;
          };

          //function to set urls as string

          var seturls = function (docs){

            var urls = [];

            docs.forEach(function (d,i){

              d.url = 'https://drive.google.com/uc?export=download&id='+d.fileid;
              urls.push(d.url);

            });
            urlsfinal = urls.join('; ');
            return urlsfinal;

          }


        // takes subdocuments key and produces flattened list of its values ->key_list
        var updateJson = function(project){
            setKey( project, 'implementing_partners','implementing_partners_list',['organization_name'] );
            setKey( project, 'strategic_objectives', 'strategic_objectives_list', ['objective_type_name', 'objective_type_description'] );
            setKey( project, 'target_beneficiaries', 'beneficiary_type_list', ['beneficiary_type_name'], true );
            // setKey( project, 'project_donor', 'project_donor_list', ['project_donor_name'] );
            setKey( project, 'activity_type', 'activity_type_list', ['cluster', 'activity_type_name'] );
            setKey( project, 'inter_cluster_activities', 'inter_cluster_activities_list', ['cluster'] );

            //values in columns to COL or values to others countries

            if(queryProject.admin0pcode == 'COL'){

              project.urls_list = seturls(project.documents);

              project.target_beneficiaries.forEach(function(tb,i){

                if(!tb.beneficiary_category_name){
                  tb.beneficiary_category_name = "Otros";
                }

                if(!tb.unit_type_id){
                  tb.unit_type_id = "Sin Información";
                }

              });

              project.target_locations.forEach(function(tb,i){

              if(!tb.site_implementation_name){
                tb.site_implementation_name = "Otro";
              }
             });

               if(project.plan_component){
                 project.plan_component_list = project.plan_component.join('; ');
               }






            setKey( project, 'project_donor', 'project_donor_list', ['project_donor_name', 'key:project_donor_budget'] );
            setKey( project, 'target_beneficiaries', 'target_beneficiaries_list', ['key:beneficiary_type_name', 'key:beneficiary_category_name', 'key:activity_type_name', 'key:activity_description_name','key:indicator_name','key:strategic_objective_name','key:strategic_objective_description','key:sector_objective_name','key:sector_objective_description','key:delivery_type_name',
             'key:units', 'key:cash_amount', 'key:households', 'key:sessions', 'key:families', 'key:boys_0_5','key:boys_6_11', 'key:boys_12_17', 'key:girls_0_5', 'key:girls_6_11','key:girls_12_17', 'key:men', 'key:women', 'key:elderly_men', 'key:elderly_women', 'key:total_male', 'key:total_female','key:unit_type_id' ]  );
            setKey( project, 'target_locations', 'target_locations_list', ['key:admin0name', 'key:admin1name','key:admin1pcode','key:admin2name','key:admin2pcode','key:site_implementation_name','key:site_type_name','key:site_name','key:admin2lng','key:admin2lat','key:name', 'key:email']  );

            setKey(project, 'undaf_desarrollo_paz','undaf_desarrollo_paz_list', ['code','name_tag','description'] );
            setKey(project, 'acuerdos_de_paz','acuerdos_de_paz_list',['code','name_tag','description']);
            setKey(project, 'dac_oecd_development_assistance_committee','dac_oecd_development_assistance_committee_list',['code','name_tag','description']);
            setKey(project, 'ods_objetivos_de_desarrollo_sostenible','ods_objetivos_de_desarrollo_sostenible_list',['code','name_tag','description']);

            }else{
                setKey( project, 'project_donor', 'project_donor_list', ['project_donor_name'] );
                setKey( project, 'project_details', 'project_details_list', ['project_detail_name'] );

                setKey( project, 'target_beneficiaries', 'target_beneficiaries_list', ['beneficiary_type_name', 'beneficiary_category_name', 'activity_type_name', 'activity_description_name','indicator_name','strategic_objective_name','strategic_objective_description','sector_objective_name','sector_objective_description','delivery_type_name',
            'key:units', 'key:cash_amount', 'key:households', 'key:sessions', 'key:families', 'key:boys', 'key:girls', 'key:men', 'key:women', 'key:elderly_men', 'key:elderly_women', 'key:unit_type_id' ]  );
                 setKey( project, 'target_locations', 'target_locations_list', ['admin0name', 'admin1name','key:admin1pcode','admin2name','key:admin2pcode','site_implementation_name','site_type_name','site_name','key:admin2lng','key:admin2lat', 'key:conflict','key:name', 'email']  );
              setKey(project, 'target_beneficiaries', 'hrp_beneficiary_type_list', ['hrp_beneficiary_type_name'], true);

            }
            // setKey( project, 'target_beneficiaries', 'target_beneficiaries_list', ['beneficiary_type_name', 'beneficiary_category_name', 'activity_type_name', 'activity_description_name','indicator_name','strategic_objective_name','strategic_objective_description','sector_objective_name','sector_objective_description','delivery_type_name',
            // 'key:units', 'key:cash_amount', 'key:households', 'key:sessions', 'key:families', 'key:boys', 'key:girls', 'key:men', 'key:women', 'key:elderly_men', 'key:elderly_women', 'key:unit_type_id' ]  );
            // setKey( project, 'target_locations', 'target_locations_list', ['admin0name', 'admin1name','key:admin1pcode','admin2name','key:admin2pcode','site_implementation_name','site_type_name','site_name','key:admin2lng','key:admin2lat', 'key:conflict','key:name', 'email']  );

        };

        async.each(projects, updateJson);

        return projects;
        }
      }
  },

  // get project details by id
  getProjectById: function(req, res){

    // request input
    if (!req.param('id')) {
      return res.json(401, { err: 'id required!' });
    }

    // project for UI
    var project = {
      project_budget_progress: [],
      target_beneficiaries: [],
      target_locations: [],
     project_components_plan: []
    };
    var project_budget_progress;
    var target_beneficiaries;
    var target_locations;
    var project_components_plan;

    // promise
    Promise.all([
      Project.find( { id: req.param('id') } ),
      BudgetProgress.find( { project_id: req.param('id') } ),
      TargetBeneficiaries.find( { project_id: req.param('id') } ),
      TargetLocation.find( { project_id: req.param('id') } )
    ])
    .catch( function( err ) {
      return res.negotiate( err );
    })
    .then( function( result ) {

      // gather results
      if ( result[ 0 ][ 0 ] ) {
        project = result[ 0 ][ 0 ];
        project_budget_progress = result[ 1 ];
        target_beneficiaries = result[ 2 ];
        target_locations = result[ 3 ];
        project_components_plan = result[4];
      }

      // create project
      project.project_budget_progress = project_budget_progress;
      project.target_beneficiaries = target_beneficiaries ? target_beneficiaries : [];
      project.target_locations = target_locations ? target_locations : [];
      project.project_components_plan = project_components_plan;

      // implementing partners?
      project.target_locations.forEach( function( location, element2 ){

        // if implement_partners
        if( typeof( location.implementing_partners ) === 'string' ){

          //
          var newarray = location.implementing_partners.split(",");
          location.implementing_partners= [];

          // new array ?
          newarray.forEach( function(imppartner,element2){

            var imppartnermayus = imppartner.toUpperCase();

            var imppartnerpush = {
              organization_name : imppartner,
              organization : imppartnermayus,
            }

            // push to location
            location.implementing_partners.push(imppartnerpush);

          });

        }

      });

      if( typeof( project.implementing_partners ) === 'string' ){

        // implementing_partners string to array
        var newarray = project.implementing_partners.split(",");
        project.implementing_partners = [];

        // new array?
        newarray.forEach( function(imppartner,element2){

          var imppartnermayus = imppartner.toUpperCase();

          var imppartnerpush = {
            organization_name : imppartner,
            organization : imppartnermayus,
          }

          project.implementing_partners.push(imppartnerpush);

        });

        } else if ( !project.implementing_partners ){
          project.implementing_partners = [];
        }

      // return Project
      return res.json( 200, project );

    });

  },

  // set project details ( UNDER CONSTRUCTION )
  setProjectById: function(req, res) {

    // request input
    if (!req.param('project')) {
      return res.json(401, { err: 'project required!' });
    }

    // get project
    var project = req.param('project');
    var project_budget_progress = req.param('project').project_budget_progress;
    var target_beneficiaries = req.param('project').target_beneficiaries;
    var target_locations = req.param('project').target_locations;

    // update project status if new
    if( project.project_status === 'new' ){
      project.project_status = 'active';
    }

    // find project
    var findProject = { project_id: project.id }

    // copy project
    var project_copy = JSON.parse( JSON.stringify( project ) );
    delete project_copy.id;
    delete project_copy.project_budget_progress;
    delete project_copy.target_beneficiaries;
    delete project_copy.target_locations;
    delete project_copy.createdAt;
    delete project_copy.updatedAt;
    delete project_copy.admin1pcode;
    delete project_copy.admin2pcode;
    delete project_copy.admin3pcode;

    var project_copy_no_cluster = JSON.parse( JSON.stringify( project_copy ) );
    delete project_copy_no_cluster.cluster;
    delete project_copy_no_cluster.cluster_id;

    var project_copy_no_implementing_partners = JSON.parse( JSON.stringify( project_copy ) );
    delete project_copy_no_implementing_partners.implementing_partners;

    var project_copy_no_cluster_no_implementing_partners = JSON.parse( JSON.stringify( project_copy_no_cluster ) );
    delete project_copy_no_cluster_no_implementing_partners.implementing_partners;
    if (project_copy_no_cluster_no_implementing_partners.project_status === 'complete') {
      project_copy_no_cluster_no_implementing_partners.report_status = 'complete'
    }
    // promise
    Promise.all([
      Project.updateOrCreate( { id: project.id }, project ),
      // budget_progress, target_beneficiaries, target_locations, report, location ( below )
      Beneficiaries.update( findProject, project_copy_no_cluster_no_implementing_partners ),
    ])
    .catch( function( err ) {
      return res.negotiate( err );
    })
    .then( function( update_result ) {

      // project update
      var project_update = ProjectController.set_result( update_result[ 0 ] );
      // update project_id (for newly created projects)
      findProject = { project_id: project_update.id }
      project_update.project_budget_progress = [];
      project_update.target_beneficiaries = [];
      project_update.target_locations = [];

      // reports holder
      var reports = [];

      // async
      var target_locations_counter = 0;
      var target_reports_counter = 0;
      var delete_reports_counter = 0;
      var async_counter = 0;
      var async_requests = 6;

      // return the project_update
      var returnProject = function(err) {
        if (err) return res.negotiate(err);
        // make locations
        if ( target_locations_counter && target_reports_counter ) {
          target_locations_counter = 0;
          target_reports_counter = 0;
          setLocations();
        }
        if ( delete_reports_counter ) {
          delete_reports_counter = 0
          removeReports();
        }
        // ++
        async_counter++;
        if ( async_counter === async_requests ) {
          return res.json( 200, project_update );
        }
      }

      // ASYNC REQUEST 1
      // async loop target_beneficiaries
      async.eachOf( project_budget_progress, function ( d, ibp, next ) {
        var budget = _under.extend( {}, d, project_copy_no_cluster );
        BudgetProgress.updateOrCreate( findProject, { id: budget.id }, budget ).exec(function( err, result ){
          project_update.project_budget_progress[ibp] = ProjectController.set_result( result );
          next();
        });
      }, function ( err ) {
        if ( err ) return err;
        returnProject();
      });

      // ASYNC REQUEST 2
      // async loop target_beneficiaries
      async.eachOf( target_beneficiaries, function ( d, ib, next ) {
        var t_beneficiary = _under.extend( {}, d, project_copy_no_cluster );
        TargetBeneficiaries.updateOrCreate( findProject, { id: t_beneficiary.id }, t_beneficiary ).exec(function( err, result ){
          project_update.target_beneficiaries[ib] = ProjectController.set_result( result );
          next(err);
        });
      }, function ( err ) {
        returnProject(err);
      });

      // ASYNC REQUEST 3
      // async loop target_locations
      async.eachOf( target_locations, function ( d, il, next ) {
        var t_location = _under.extend( {}, d, project_copy_no_implementing_partners, {
          name: d.name,
          position: d.position,
          phone: d.phone,
          email: d.email,
          username: d.username
        } );
        TargetLocation.updateOrCreate( findProject, { id: t_location.id }, t_location ).exec(function( err, result ){
          project_update.target_locations[il] = ProjectController.set_result( result );
          next(err);
        });
      }, function ( err ) {
        if ( err ) return returnProject(err);
        target_locations_counter++;
        returnProject();
      });

      // generate reports for duration of project_update
      ProjectController.getProjectReports( project_update, function( err, project_reports ){
        // err
        if (err) return returnProject(err);
        
        // ASYNC REQUEST 4
        // async loop project_reports
        async.each( project_reports, function ( d, next ) {
          // Report.updateOrCreate( findProject, { project_id: project_update.id, report_month: d.report_month, report_year: d.report_year }, d ).exec(function( err, result ){
          var filterReport = { project_id: project_update.id, report_month: d.report_month, report_year: d.report_year }
          if (project_update.report_type_id && project_update.report_type_id === 'bi-weekly') {
            filterReport = _.extend({}, filterReport, { report_type_id: d.report_type_id, reporting_period: { $gte: moment(d.reporting_period).startOf('day').toDate(), $lte: moment(d.reporting_period).endOf('day').toDate() } })
          }
          // Report.findOne( { project_id: project_update.id, report_month: d.report_month, report_year: d.report_year } ).then( function ( report ){
          Report.findOne( filterReport ).then( function ( report ){
            if( !report ) { report = { id: null } }
            if ( report ) { d.report_status = report.report_status; d.report_active = report.report_active, d.updatedAt = report.updatedAt }
            if ( d.project_status === 'complete' ) d.report_status = 'complete';
            // Report update or create
            Report.updateOrCreate( findProject, { id: report.id }, d ).exec(function( err, result ){
              reports.push( ProjectController.set_result( result ) );
              next(err);
            });
          });
        }, function ( err ) {
          if ( err ) return returnProject(err);
          target_reports_counter++;
          returnProject();
        });

      });

      // ASYNC REQUEST 6
      var removeReports = async function () {
        // construct find query
        const lt_project_start_date = new Date(moment(project_update.project_start_date).subtract(1, 'month').endOf('month'))
        const gt_project_end_date = new Date(moment(project_update.project_end_date).add(1, 'month').startOf('month'))

        const find = {
          project_id: project_update.id,
          $or: [
            {
              reporting_period: { $lte: new Date(lt_project_start_date) }
            },
            {
              reporting_period: { $gte: new Date(gt_project_end_date) }
            }
          ]
        };

        try {
          // find reports outside of project dates
          const reports = await Report.find(find, { select: ['id'] });
          const uniq_reports = [...new Set(reports.map(b => b.id))];

          const beneficiaries = await Beneficiaries.find({ report_id: { $in: uniq_reports } }, { select: ['report_id'] })
          const uniq_reports_with_beneficiaries = [...new Set(beneficiaries.map(b => b.report_id))];

          const reports_to_delete = _.difference(uniq_reports, uniq_reports_with_beneficiaries);

          await Promise.all([
            Report.destroy({ id: { $in: reports_to_delete } }),
            Location.destroy({ report_id: { $in: reports_to_delete } }),
          ]);

          returnProject(null);

        } catch (err) {
          returnProject(err);
        }

      };

      // locations
      var setLocations = function() {

        // generate locations for each report ( requires report_id )
        ProjectController.getProjectReportLocations( reports, project_update.target_locations, function( err, locations ){

          // err
          if ( err ) return returnProject(err);

          // ASYNC REQUEST 5
          // async loop project_update locations
          async.each( locations, function ( d, next ) {
            var filterLocation = { project_id: project_update.id, target_location_reference_id: d.target_location_reference_id, report_month: d.report_month, report_year: d.report_year };
            if (project_update.report_type_id && project_update.report_type_id === 'bi-weekly'){
              filterLocation = _.extend({}, filterLocation, { report_type_id: d.report_type_id, reporting_period: { $gte: moment(d.reporting_period).startOf('day').toDate(), $lte: moment(d.reporting_period).endOf('day').toDate() } })
            }
            // Location.findOne( { project_id: project_update.id, target_location_reference_id: d.target_location_reference_id, report_month: d.report_month, report_year: d.report_year } ).then( function ( location ){
            Location.findOne(filterLocation).then(function (location) {
              if( !location ) { location = { id: null } }
              if ( d.project_status === 'complete' ) d.report_status = 'complete';
              // relations set in getProjectReportLocations
              Location.updateOrCreate( findProject, { id: location.id }, d ).exec(function( err, result ){
                // no need to return locations
                next();
              });
            });
          }, function ( err ) {
            if ( err ) return returnProject(err);
            delete_reports_counter++;
            returnProject();
          });

        });
      }

    });

  },

  // remvoe budget item
  removeBudgetItemById: function(req, res) {
    // request input
    if ( !req.param( 'id' ) ) {
      return res.json({ err: true, error: 'id required!' });
    }

    var id = req.param( 'id' );

    // target beneficiaries
    BudgetProgress
      .update( { id: id }, { project_id: null } )
      .exec( function( err, result ){

        // return error
        if ( err ) return res.json({ err: true, error: err });

        // return Project
        return res.json( 200, { msg: 'Success!' } );

      });
  },

  // remove target beneficiary
  removeBeneficiaryById: function(req, res) {
    // request input
    if ( !req.param( 'id' ) ) {
      return res.json({ err: true, error: 'id required!' });
    }

    var id = req.param( 'id' );

    // target beneficiaries
    TargetBeneficiaries
      .update( { id: id }, { project_id: null } )
      .exec( function( err, result ){

        // return error
        if ( err ) return res.json({ err: true, error: err });

        // return Project
        return res.json( 200, { msg: 'Success!' } );

      });
  },

  // remove target location
  removeLocationById: async function( req, res ) {

    // request input
    if (!req.param('id')) {
      return res.json({ err: true, error: 'id required!' });
    }

    // get id
    var id = req.param('id');

    try {
      // find locations containing beneficiaries first
      const beneficiaries = await Beneficiaries.find({ target_location_reference_id: id }, { select: ['location_id'] })
      const uniq_locations = [...new Set(beneficiaries.map(b => b.location_id))];

      await Promise.all([
        TargetLocation.destroy({ id: id }),
        Location.destroy({ target_location_reference_id: id, id: { $nin: uniq_locations } })
      ])

      return res.json(200, { msg: 'Success!' });

    } catch (err) {
      return res.negotiate(err);
    }

  },

  // delete project
  deleteProjectById: function(req, res) {

    // request input
    if ( !req.param( 'project_id' ) ) {
      return res.json( 401, { err: 'project_id required!' } );
    }

    // project id
    var project_id = req.param( 'project_id' );

    // promise
    Promise.all([
      Project.destroy( { id: project_id } ),
      TargetBeneficiaries.destroy( { project_id: project_id } ),
      TargetLocation.destroy( { project_id: project_id } ),
      BudgetProgress.destroy( { project_id: project_id } ),
      Report.destroy( { project_id: project_id } ),
      Location.destroy( { project_id: project_id } ),
      Beneficiaries.destroy( { project_id: project_id } )
    ])
    .catch( function( err ) {
      return res.negotiate( err );
    })
    .then( function( result ) {

      // return
      return res.json( 200, { msg: 'Project ' + project_id + ' has been deleted!' } );

    });
  },

  getFinancialDetails: function(req, res){
    // request input
    if ( !req.param( 'project_id' ) ) {
      return res.json( 401, { err: 'project_id required!' } );
    }
    // project id
    var project_id = req.param( 'project_id' );

    // fields
    var fields = [ 'cluster', 'organization', 'admin0name', 'project_title', 'project_description', 'project_hrp_code', 'project_budget', 'project_budget_currency', 'project_donor_name', 'grant_id', 'activity_type_name','activity_description_name', 'currency_id', 'project_budget_amount_recieved', 'contribution_status', 'project_budget_date_recieved', 'budget_funds_name', 'financial_programming_name', 'multi_year_funding_name', 'multi_year_array', 'reported_on_fts_name', 'fts_record_id', 'email', 'createdAt', 'comments' ]
        fieldNames = [ 'Cluster', 'Organization', 'Country', 'Project Title', 'Project Description', 'HRP Project Code', 'Project Budget', 'Project Budget Currency', 'Project Donor', 'Donor Grant ID', 'Activity Type','Activity Description', 'Currency Recieved', 'Ammount Received', 'Contribution Status', 'Date of Payment', 'Incoming Funds', 'Financial Programming', 'Multi-Year Funding', 'Funding Per Year', 'Reported on FTS', 'FTS ID', 'Email', 'createdAt', 'Comments' ];

    // get data by project

    BudgetProgress
      .find()
      .where( { project_id: project_id } )
      .exec( function( err, budget ){

        // return error
        if (err) return res.negotiate( err );

        // format multi year
        budget.forEach(function (d, i) {
          if (d.multi_year_array && d.multi_year_array.length) {
            budget[i].multi_year_array = d.multi_year_array.map(e => typeof e.budget === 'undefined' || typeof e.year === 'undefined' ? "" : e.budget + " " + e.year).join("; ")
          }
        });

        // return csv
        json2csv({ data: budget, fields: fields, fieldNames: fieldNames }, function( err, csv ) {

          // error
          if ( err ) return res.negotiate( err );

          // success
          if ( req.params.text ) {
            res.set('Content-Type', 'text/csv');
            return res.send( 200, csv );
          } else {
            return res.json( 200, { data: csv } );
          }

        });

      });
  },

  getProjectsColAPC: function(req,res){



    // if dissallowed parameters sent
    if (
          !req.param('adminRpcode') ||
          !req.param('admin0pcode') ||
          !req.param('donor_tag') ||
          !req.param('start_date') ||
          !req.param('end_date') ) {
     return res.json(401, {err: 'adminRpcode, admin0pcode, donor_tag,start_date, end_date required!'});
    }else{

      if(req.param('donor_tag') !== 'all'){
      donor_tag = req.param('donor_tag').split(",");
       allowedParams ={
          adminRpcode : 'AMER',
          admin0pcode :'COL',

         project_donor : {$elemMatch:{project_donor_id : { $in :  donor_tag}}},
        //project_start_date: {$gte : new Date(req.param('start_date'))},
        // project_end_date: {$lte : new Date(req.param('end_date'))}
        project_start_date: { $gte: new Date( req.param('start_date')), $lte: new Date( req.param('end_date') )}
      };

    }else{
       allowedParams ={
          adminRpcode : 'AMER',
          admin0pcode :'COL',
          //project_donor: req.param('donor_tag') === 'all' ? {} : {  "project_donor.project_donor_id" : { $in :  donor_tag}},
         // project_start_date: {$gte : new Date(req.param('start_date'))},
        // project_end_date: {$lte : new Date(req.param('end_date'))}
        project_start_date: { $gte: new Date( req.param('start_date')), $lte: new Date( req.param('end_date') )}
      };
    };

    }


     var pipe = Promise.resolve()
      .then(function(){ return actions._getProjectDataColAPC(allowedParams) })
      .then(function(res){ return actions._processCollectionsColAPC(res) })
      .then(function($project){ return actions._doResponseColAPC($project) })
      .catch(function(err){ return err === 'NO PROJECT' } , function(err) { return actions._errorNoProjectRes(err) })
      .catch(function(err){ return actions._error(err) });


      var actions = {

           _error : function(err){
      return res.negotiate(err);
    },

    _errorNoProjectRes : function(err){
      return res.json( 200, [] );
    },
          _getProjectDataColAPC : function(queryProject){


                  return Promise.props({
                          project: Project.find( queryProject),
                          //budget: BudgetProgress.find( queryProject ),
                          beneficiaries: TargetBeneficiaries.find( queryProject ),
                          targetlocations: TargetLocation.find( queryProject ),
                          //project documents
                          documents: Documents.find(queryProject),
                          //organizations: Organizations.find(queryProject),
                          //Report.find( findProject, updatedRelationsUser ),
                          //Location.update( findProject, updatedRelationsUser ),
                          //Beneficiaries.find( findProject, updatedRelationsUser ),
                        });



          },

          _processCollectionsColAPC : function(data){


            // no project found
            if ( !data.project.length ) return Promise.reject('NO PROJECT');

            // all projects
            $project = [];

            var _comparatorBuilder = this._comparatorBuilder

            // populate&sort fields
                              // TODO maybe realate models via populate
            var uppendDataToProject = function(project){

                          var projectId = project.id;
                          var i = data.project.indexOf(project);
                          // assemble project data
                          $project[i] = {};
                          $project[i].id_proyecto = project.id;
                          $project[i].titulo_del_proyecto = project.project_title;
                          if(project.project_status === 'active'){
                         $project[i].estado_del_proyecto = 'Activo';
                       }else if(project.project_status === 'complete'){
                         $project[i].estado_del_proyecto = 'Completo'
                       };

                       $project[i].codigo_del_proyecto =project.project_code;
                       $project[i].descripcion =project.description;
                       $project[i].moneda_del_proyecto =project.project_budget_currency;
                       $project[i].id_agencia_ejecutora =project.organization_tag;
                       $project[i].nombre_agencia_ejecutora =project.organization_name;
                       $project[i].nombre_agencia_ejecutora =project.organization_name;

                       if(project.project_donor){

                         var donantes_proyecto = [];

                         project.project_donor.forEach(function (don,i){

                           donor = {
                             'id_donante':don.project_donor_id,
                             'nombre_donante':don.project_donor_name,
                             'monto_aporte_donante':don.project_donor_budget
                           }

                           donantes_proyecto.push(donor);

                         });

                         $project[i].agencias_donantes_del_proyecto = donantes_proyecto;

                       };


                       if(project.implementing_partners){

                         var socios =[];

                         project.implementing_partners.forEach(function(socioimp,i){

                           nuevo_socio = {

                             'id_socio_implementador' : socioimp.organization_tag,
                             'nombre_socio_implementador': socioimp.organization_name,
                             'tipo_de_organizacion': socioimp.organization_type
                           };

                           socios.push(nuevo_socio);

                         });
                          $project[i].agencias_socios_implementadores = socios;

                       };


                        if(project.dac_oecd_development_assistance_committee){

                        var dac_relacion = [];

                         project.dac_oecd_development_assistance_committee.forEach(function(dac,i){

                           dac_nuevo = {

                             'id':dac.sidi_id,
                             'codigo':dac.code,
                             'nombre':dac.name_tag,
                             'descripcion':dac.description

                           };

                           dac_relacion.push(dac_nuevo);

                         });

                         $project[i].relacion_con_cad = dac_relacion;

                       };


                        if(project.acuerdos_de_paz){

                         var acuerdos_de_paz_relacion = [];

                         project.acuerdos_de_paz.forEach(function(acuerdo,i){

                           acuerdo_paz_nuevo = {

                             'id':acuerdo.sidi_id,
                             'codigo':acuerdo.code,
                             'nombre':acuerdo.name_tag,
                             'descripcion':acuerdo.description

                           };

                           acuerdos_de_paz_relacion.push(acuerdo_paz_nuevo);
                         });

                         $project[i].relacion_con_pmi_acuerdo_de_paz = acuerdos_de_paz_relacion;
                       };


                        if(project.ods_objetivos_de_desarrollo_sostenible){

                         var relacion_ods = [];

                         project.ods_objetivos_de_desarrollo_sostenible.forEach(function(ods,i){

                           ods_nuevo = {

                             'id':ods.sidi_id,
                             'codigo':ods.code,
                             'nombre':ods.name_tag,
                             'descripcion':ods.description

                           };

                           relacion_ods.push(ods_nuevo);

                         });

                         $project[i].relacion_con_ods = relacion_ods;
                       }



                        //  $project[i].project_budget_progress = _.filter(data.budget, { 'project_id' : projectId}) ;
                          project.target_beneficiaries = _.filter(data.beneficiaries, { 'project_id' : projectId}) ;
                          project.target_locations = _.filter(data.targetlocations,       { 'project_id' : projectId}) ;
                          project.documents = _.filter(data.documents,       { 'project_id' : projectId}) ;

                          if(project.documents){

                            var documentos = [];

                            project.documents.forEach(function(docu,i){

                              docu.url = 'https://drive.google.com/uc?export=download&id='+docu.fileid;
                              documentos.push(docu.url);

                            });

                            $project[i].documentos = documentos.join();

                          }

                          /// order
                         /* $project[i].target_beneficiaries
                                     .sort(function(a, b){ return a.id.localeCompare( b.id ) });*/
                          if(project.target_beneficiaries.length > 0){
                           var beneficiarios  = [];

                          project.target_beneficiaries.forEach(function(registrobeneficiarios,j){

                            var newbenef = {};

                            newbenef.id = registrobeneficiarios.id;

                            newbenef.total_hombres = registrobeneficiarios.total_male;
                            newbenef.total_mujeres = registrobeneficiarios.total_female;

                            newbenef.niños_0_5 = registrobeneficiarios.boys_0_5;
                            newbenef.niños_6_11 = registrobeneficiarios.boys_6_11;
                            newbenef.niños_12_17 = registrobeneficiarios.boys_12_17;
                            newbenef.total_niños = newbenef.niños_0_5 + newbenef.niños_6_11 + newbenef.niños_12_17;

                            newbenef.hombres_18_59 = registrobeneficiarios.men;
                            newbenef.hombres_60_mas = registrobeneficiarios.elderly_men;


                            newbenef.niñas_0_5 = registrobeneficiarios.girls_0_5;
                            newbenef.niñas_6_11 = registrobeneficiarios.girls_6_11;
                            newbenef.niñas_12_17 = registrobeneficiarios.girls_12_17;
                            newbenef.total_niñas = newbenef.niñas_0_5 + newbenef.niñas_6_11 + newbenef.niñas_12_17;

                            newbenef.mujeres_18_59 = registrobeneficiarios.women;
                            newbenef.mujeres_60_mas = registrobeneficiarios.elderly_women;

                            newbenef.total_niños_niñas_0_5 =  newbenef.niños_0_5 + newbenef.niñas_0_5;
                            newbenef.total_niños_niñas_6_11 = newbenef.niños_6_11 + newbenef.niñas_6_11;
                            newbenef.total_niños_niñas_12_17 = newbenef.niños_12_17 + newbenef.niñas_12_17;
                            newbenef.total_hombres_mujeres_18_59 = newbenef.hombres_18_59 + newbenef.mujeres_18_59;
                            newbenef.total_hombres_mujeres_60_mas = newbenef.hombres_60_mas + newbenef.mujeres_60_mas;

                            newbenef.enfoque_diferencial = registrobeneficiarios.beneficiary_type_name;
                            newbenef.tipo_de_actividad = registrobeneficiarios.activity_type_name
                            newbenef.descripcion = registrobeneficiarios.activity_description_name;

                             beneficiarios.push(newbenef);


                          });

                          $project[i].beneficiarios = beneficiarios;
                        }


                          if(project.target_locations){

                            var ubicaciones = [];

                            project.target_locations.forEach(function(ubi,i){

                              var nuevaubi = {};

                              nuevaubi.id = ubi.id;

                              nuevaubi.tipo_de_lugar = ubi.site_type_name;
                              nuevaubi.nombre_del_lugar = ubi.site_name;

                              nuevaubi.dipola_departamento = ubi.admin1pcode;
                              nuevaubi.nombre_departamento = ubi.admin1name;
                              nuevaubi.dipola_municipio = ubi.admin2pcode;
                              nuevaubi.nombre_municipio = ubi.admin2name;

                              ubicaciones.push(nuevaubi);

                            });

                            $project[i].territorios = ubicaciones;

                          }

                          $project[i].fecha_inicio_del_proyecto = moment(project.project_start_date).format('YYYY-MM-DD');
                          $project[i].fecha_final_del_proyecto   = moment(project.project_end_date).format('YYYY-MM-DD');
                          $project[i].fecha_ultima_modificacion   = moment( project.updatedAt ).format('YYYY-MM-DD');
                          // callback if error or post work can be called here `cb()`;
                      };

            async.each(data.project, uppendDataToProject);

            return $project;
          },

           // build a to b localeCompare from array of props
        _comparatorBuilder : function(compareObj){
            var compareArr = [];
            compareObj.forEach( function (criteria, i ) {
              compareArr.push('a'+'.'+criteria + '.' + 'localeCompare(b.' + criteria + ')');
            });
            return compareArr.join('||')
        },


          _doResponseColAPC : function($project){



            return res.json( 200, $project.length===1?$project[0]:$project );

          }

       }

  },

  // request as csv
	getProjectCsv: function( req, res ) {

    // request input
    if ( !req.param( 'project_id' ) ) {
      return res.json( 401, { err: 'project_id required!' });
    }

    let project_cluster_id = req.param('project_cluster_id');
    let project_admin0pcode = req.param('project_admin0pcode');

    let { fields, fieldNames } = FieldsService.getReportCsvFields(project_admin0pcode, project_cluster_id);

    // beneficiaries
    Beneficiaries
      .find( )
      .where( { project_id: req.param( 'project_id' ) } )
      .exec(function( err, response ){

        // error
        if ( err ) return res.negotiate( err );

        // format  / sum
        response.forEach(function( d, i ){

          d.implementing_partners = Utils.arrayToString(d.implementing_partners, "organization");
          d.programme_partners = Utils.arrayToString(d.programme_partners, "organization");
          d.donors = Utils.arrayToString(d.project_donor, "organization");

          response[i].report_month = moment( response[i].reporting_period ).format( 'MMMM' );

          d.updatedAt = moment(d.updatedAt).format('YYYY-MM-DD HH:mm:ss');
          d.createdAt = moment(d.createdAt).format('YYYY-MM-DD HH:mm:ss');

        });

        // return csv
        json2csv({ data: response, fields: fields, fieldNames: fieldNames }, function( err, csv ) {

          // error
          if ( err ) return res.negotiate( err );

          // success
          return res.json( 200, { data: csv } );

        });

      });

  },

  // update beneficiaries by id ( cluster admin correction )
  setBeneficiariesById: function (req, res) {
    // request input
    if (!req.param('beneficiaries') || !Array.isArray(req.param('beneficiaries'))) {
      return res.json(401, { err: 'beneficiaries array required!' });
    }
    let beneficiaries = req.param('beneficiaries');
    let beneficiaries_update = [];

    // return res
    let returnBeneficiaries = function (err) {
      if (err) return res.json(500, { err: err });
      return res.json(200, { beneficiaries: beneficiaries_update });
    }

    async.eachOf(beneficiaries, function (b, ib, next) {
      delete b.updatedAt;
      delete b.createdAt;
      if (b.id) {
        let id = b.id;
        Beneficiaries.update({ id: b.id }, b).exec(function (err, result) {
          if (err) return next(err);
          let resultObj = Utils.set_result(result);
          if (resultObj) {
            resultObj.updated = true
            beneficiaries_update[ib] = resultObj;
          } else {
            b.updated = false
            b.id = id;
            beneficiaries_update[ib] = b;
          }
          next();
        });
      } else {
        b.updated = false
        beneficiaries_update[ib] = b;
        next();
      }
    }, function (err) {
      returnBeneficiaries(err);
    });
  },

  setBeneficiaryById: async function (req, res) {
    // request input
    let beneficiary = req.param('beneficiary');

    if (!beneficiary) {
      return res.json(401, { err: 'beneficiary required!' });
    }

    if (!beneficiary.id) {
      return res.json(401, { err: 'id required!' });
    }

    // check if user can modify record
    let edit = await AuthService.canEditRecord(req.token, 'Beneficiaries', beneficiary.id);
    if (edit.err){
      return res.json(edit.code, { err: err.err });
    }

    delete beneficiary.updatedAt;
    delete beneficiary.createdAt;
    // update of next fields not allowed
    delete beneficiary.adminRpcode;
    delete beneficiary.admin0pcode;
    delete beneficiary.organization;
    delete beneficiary.organization_id;
    delete beneficiary.organization_tag;
    delete beneficiary.report_id;
    delete beneficiary.project_id;
    delete beneficiary.location_id;


    if (beneficiary.id) {
      Beneficiaries.update({ id: beneficiary.id }, beneficiary).exec(function (err, result) {
        if (err) return res.negotiate(err);
        result = Utils.set_result(result);
        if (!result) {
          return res.json(404, { err: 'Beneficiary with such id not found!' });
        }
        return res.json(200, { beneficiary: result });
      });
    } else {
      return res.json(401, { err: 'id required!' });
    }

  },
  // send email to delete project
  sendRequestToDeleteProject: function (req, res) {

    // check params
    if (!req.param('organization_tag') && !req.param('reasons') && !req.param('url') && !req.param('admin0pcode')) {
      return res.json(401, { msg: 'organization_tag, url, reason required' });
    }
    // file system
    var fs = require('fs');

    let organization_tag = req.param('organization_tag');
        reasons_string = req.param('reasons');
        admin0pcode = req.param('admin0pcode');
        project_url = req.param('url');
        project_title = req.param('project_title');
        url_profile_user = req.param('url_user')
        username = req.param('username');
        fullname = req.param('name');
        country = req.param('admin0name');
        focal_point = req.param('focal_point');
        focal_point_username = req.param('focal_point_username');
        focal_point_email = req.param('focal_point_email');
    list_emails = [{ email: 'ngmreporthub@gmail.com', recipient: 'Admin' }, { email: 'nsadaqatzada@immap.org', recipient: 'Admin' }, { email: 'finka.mail@gmail.com', recipient: 'Admin' }, { email: 'farifin@immap.org', recipient: 'Admin'}]


    User
      .find({ organization_tag: organization_tag, admin0pcode: admin0pcode, roles: { $in: ['ORG'] }, status:"active"})
      .exec(function (err, admins) {
        // if no config file, return, else send email ( PROD )
        if (!fs.existsSync('/home/ubuntu/nginx/www/ngm-reportEngine/config/email.js')) return res.json(200, { 'data': 'No email config' });

        // push admin email to list_email array 
        if(admins.length){
          admins.forEach(function (a, i) {
            list_emails.push({ email: a.email, recipient: a.name})
          });
        };

        list_emails.forEach(email => {
          // send email
          sails.hooks.email.send('delete-project', {
            type: 'Delete Project',
            senderName: 'ReportHub',
            title: project_title,
            user: username,
            fullname: fullname,
            full_name: fullname,
            recipient: email.recipient,
            country: country,
            url_profile_user: url_profile_user,
            project_url: project_url,
            reasons: reasons_string,
            focal_point:focal_point,
            focal_point_username: focal_point_username,
            focal_point_email:focal_point_email
          }, {
            to: email.email,
            subject: 'ReportHub - Request Delete Project'
          }, function (err) {

            // return error
            if (err) return res.negotiate(err);

          });
        });
      })
    
    return res.json(200,{msg:'Success!'});

  },

};

module.exports = ProjectController;
